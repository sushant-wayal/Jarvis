package com.jarvis.earbud

import android.app.*
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.*
import android.os.*
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * JarvisForegroundService — the core of background earbud interaction.
 *
 * TWO-MODE OPERATION:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  FOREGROUND MODE (app on screen or JS thread alive)             │
 * │  Tap → emitEarbudEvent("SINGLE_TAP") → JS handles recording     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  BACKGROUND MODE (screen off, JS thread dead/frozen)            │
 * │  Tap → native MediaRecorder → OkHttp → brain API → notification │
 * │  Jarvis speaks the response through earbuds via MediaPlayer     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Lifecycle:
 *  - Started as a foreground service when the app initializes (earbudService.initialize())
 *  - Runs indefinitely with START_STICKY (auto-restarts if killed)
 *  - Shows a persistent low-priority notification
 *  - Keeps a MediaSession ACTIVE + holds audio focus so Android routes
 *    Bluetooth AVRCP events to this app
 */
class JarvisForegroundService : Service() {

    companion object {
        private const val TAG = "JarvisForegroundService"

        // Notification
        private const val NOTIFICATION_ID = 9001
        private const val RESULT_NOTIFICATION_ID = 9002
        private const val CHANNEL_ID = "jarvis_earbud_service"
        private const val CHANNEL_NAME = "Jarvis Earbud Listener"

        // Intent extras / actions
        const val ACTION_MEDIA_BUTTON = "com.jarvis.MEDIA_BUTTON"
        const val ACTION_STOP_RECORDING = "com.jarvis.STOP_RECORDING"
        const val EXTRA_BRAIN_URL = "BRAIN_URL"
        const val EXTRA_KEY_CODE = "KEY_CODE"

        // Tap debounce: ignore a second PLAY_PAUSE within this window (ms)
        private const val TAP_DEBOUNCE_MS = 600L

        // Auto-stop recording after this many ms of silence
        private const val SILENCE_THRESHOLD_MS = 2200L
        private const val SILENCE_AMPLITUDE = 900

        // Max recording duration
        private const val MAX_RECORD_MS = 12_000L

        @Volatile
        private var brainUrl: String = "https://brainofjarvis.vercel.app/api/v1"
    }

    // ─── State ────────────────────────────────────────────────────────────────

    private enum class State { IDLE, RECORDING, PROCESSING }

    @Volatile
    private var state = State.IDLE

    private var lastTapTs = 0L

    // ─── Native audio ─────────────────────────────────────────────────────────

    private var mediaRecorder: MediaRecorder? = null
    private var recordingFile: File? = null

    // ─── MediaSession (keeps BT routing alive) ────────────────────────────────

    private var mediaSession: MediaSessionCompat? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    // ─── Handlers ─────────────────────────────────────────────────────────────

    private val mainHandler = Handler(Looper.getMainLooper())
    private var silenceStartTs = 0L

    private val silencePoller = object : Runnable {
        override fun run() {
            val recorder = mediaRecorder ?: return
            if (state != State.RECORDING) return

            val amplitude = try { recorder.maxAmplitude } catch (e: Exception) { return }

            if (amplitude < SILENCE_AMPLITUDE) {
                if (silenceStartTs == 0L) silenceStartTs = System.currentTimeMillis()
                else if (System.currentTimeMillis() - silenceStartTs >= SILENCE_THRESHOLD_MS) {
                    Log.d(TAG, "Silence detected → stopping recording")
                    stopNativeRecording()
                    return
                }
            } else {
                silenceStartTs = 0L
            }
            mainHandler.postDelayed(this, 250)
        }
    }

    private val maxDurationStopper = Runnable {
        if (state == State.RECORDING) {
            Log.d(TAG, "Max duration reached → stopping recording")
            stopNativeRecording()
        }
    }

    // ─── HTTP client ──────────────────────────────────────────────────────────

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    // ─── Service lifecycle ────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Jarvis · Tap earbud to speak"))
        initMediaSession()
        requestAudioFocus()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_MEDIA_BUTTON -> {
                val keyCode = intent.getIntExtra(EXTRA_KEY_CODE, KeyEvent.KEYCODE_UNKNOWN)
                handleMediaButton(keyCode)
            }
            ACTION_STOP_RECORDING -> {
                if (state == State.RECORDING) stopNativeRecording()
            }
            else -> {
                intent?.getStringExtra(EXTRA_BRAIN_URL)?.takeIf { it.isNotBlank() }?.let {
                    brainUrl = it
                    Log.d(TAG, "Brain URL set: $brainUrl")
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacksAndMessages(null)
        cleanupRecorder()
        abandonAudioFocus()
        mediaSession?.run { isActive = false; release() }
        Log.d(TAG, "Service destroyed")
    }

    // ─── MediaSession setup ───────────────────────────────────────────────────

    private fun initMediaSession() {
        val receiverComponent = ComponentName(this, JarvisMediaButtonReceiver::class.java)

        mediaSession = MediaSessionCompat(this, "JarvisEarbud", receiverComponent, null).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_STOP
                    )
                    .setState(PlaybackStateCompat.STATE_PLAYING, 0L, 1f)
                    .build()
            )
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onMediaButtonEvent(event: Intent): Boolean {
                    val ke: KeyEvent? = if (Build.VERSION.SDK_INT >= 33) {
                        event.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        event.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
                    }
                    if (ke?.action == KeyEvent.ACTION_DOWN) {
                        handleMediaButton(ke.keyCode)
                        return true
                    }
                    return super.onMediaButtonEvent(event)
                }

                override fun onPlay()  { handleMediaButton(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) }
                override fun onPause() { handleMediaButton(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) }
                override fun onStop()  { handleMediaButton(KeyEvent.KEYCODE_MEDIA_STOP) }
                override fun onSkipToNext()     { handleMediaButton(KeyEvent.KEYCODE_MEDIA_NEXT) }
                override fun onSkipToPrevious() { handleMediaButton(KeyEvent.KEYCODE_MEDIA_PREVIOUS) }
            })
            isActive = true
        }
    }

    @Suppress("DEPRECATION")
    private fun requestAudioFocus() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener {}
                .build()
            audioFocusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
    }

    @Suppress("DEPRECATION")
    private fun abandonAudioFocus() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            audioManager.abandonAudioFocus(null)
        }
    }

    // ─── Media button handling ────────────────────────────────────────────────

    private fun handleMediaButton(keyCode: Int) {
        Log.d(TAG, "Media button keyCode=$keyCode state=$state")

        // Debounce rapid double-fires from some earbuds
        val now = System.currentTimeMillis()
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_HEADSETHOOK) {
            if (now - lastTapTs < TAP_DEBOUNCE_MS && state == State.IDLE) return
            lastTapTs = now
        }

        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK -> {
                when (state) {
                    State.IDLE -> {
                        // Try JS first (app in foreground); fall back to native recording
                        val jsAlive = JarvisEarbudModule.isReactContextAlive()
                        if (jsAlive) {
                            JarvisEarbudModule.emitEarbudEvent("SINGLE_TAP")
                        } else {
                            startNativeRecording()
                        }
                    }
                    State.RECORDING -> stopNativeRecording()
                    State.PROCESSING -> { /* ignore taps while processing */ }
                }
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> JarvisEarbudModule.emitEarbudEvent("DOUBLE_TAP")
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> JarvisEarbudModule.emitEarbudEvent("TRIPLE_TAP")
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                if (state == State.RECORDING) stopNativeRecording()
                JarvisEarbudModule.emitEarbudEvent("LONG_PRESS")
            }
        }
    }

    // ─── Native recording pipeline ────────────────────────────────────────────

    private fun startNativeRecording() {
        if (state != State.IDLE) return
        state = State.RECORDING
        silenceStartTs = 0L

        updateNotification("🎙 Listening… Tap earbud to stop")

        try {
            val file = File(cacheDir, "jarvis_rec_${System.currentTimeMillis()}.m4a")
            recordingFile = file

            mediaRecorder = (
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this)
                else @Suppress("DEPRECATION") MediaRecorder()
            ).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(44100)
                setAudioEncodingBitRate(128000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }

            // Start silence-detection polling (after 1.5s to let user start speaking)
            mainHandler.postDelayed({ mainHandler.post(silencePoller) }, 1500)

            // Hard cap on recording duration
            mainHandler.postDelayed(maxDurationStopper, MAX_RECORD_MS)

        } catch (e: Exception) {
            Log.e(TAG, "Recording start failed: ${e.message}")
            cleanupRecorder()
            state = State.IDLE
            updateNotification("Jarvis · Tap earbud to speak")
        }
    }

    private fun stopNativeRecording() {
        if (state != State.RECORDING) return
        state = State.PROCESSING

        mainHandler.removeCallbacks(silencePoller)
        mainHandler.removeCallbacks(maxDurationStopper)

        updateNotification("🧠 Thinking…")

        val recorder = mediaRecorder
        val file = recordingFile

        try {
            recorder?.stop()
            recorder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Stop recorder error: ${e.message}")
        }
        mediaRecorder = null
        recordingFile = null

        if (file == null || !file.exists() || file.length() == 0L) {
            state = State.IDLE
            updateNotification("Jarvis · Tap earbud to speak")
            return
        }

        // Process audio on a background thread
        Thread {
            try {
                val bytes = file.readBytes()
                file.delete()
                val base64Audio = Base64.encodeToString(bytes, Base64.NO_WRAP)
                callBrainApi(base64Audio, "audio/m4a")
            } catch (e: Exception) {
                Log.e(TAG, "Audio processing failed: ${e.message}")
                state = State.IDLE
                showResultNotification("Jarvis couldn't process that. Try again.")
                updateNotification("Jarvis · Tap earbud to speak")
            }
        }.start()
    }

    private fun cleanupRecorder() {
        try { mediaRecorder?.stop() } catch (_: Exception) {}
        try { mediaRecorder?.release() } catch (_: Exception) {}
        mediaRecorder = null
        recordingFile?.delete()
        recordingFile = null
    }

    // ─── Brain API call ───────────────────────────────────────────────────────

    private fun callBrainApi(audioBase64: String, mimeType: String) {
        val url = "$brainUrl/process-voice"
        Log.d(TAG, "Calling brain: $url")

        try {
            val bodyJson = JSONObject().apply {
                put("audioBase64", audioBase64)
                put("mimeType", mimeType)
            }.toString()

            val request = Request.Builder()
                .url(url)
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()

            http.newCall(request).execute().use { response ->
                state = State.IDLE

                if (!response.isSuccessful) {
                    Log.e(TAG, "Brain API error: ${response.code}")
                    showResultNotification("Jarvis: couldn't connect. Try again.")
                    updateNotification("Jarvis · Tap earbud to speak")
                    return
                }

                val json = JSONObject(response.body?.string() ?: "{}")
                val textResponse = json.optString("response", "").trim()
                val audioB64 = json.optString("audioBase64", "")

                // Play audio response through earbuds if available
                if (audioB64.isNotEmpty()) {
                    playAudioResponse(audioB64)
                }

                // Show notification with the text response
                if (textResponse.isNotEmpty()) {
                    val preview = if (textResponse.length > 120) textResponse.take(120) + "…" else textResponse
                    showResultNotification(preview)
                }

                updateNotification("Jarvis · Tap earbud to speak")
            }
        } catch (e: Exception) {
            state = State.IDLE
            Log.e(TAG, "Brain API call failed: ${e.message}")
            showResultNotification("Jarvis: network error. Check your connection.")
            updateNotification("Jarvis · Tap earbud to speak")
        }
    }

    // ─── Audio playback ───────────────────────────────────────────────────────

    private fun playAudioResponse(base64Audio: String) {
        try {
            val audioBytes = Base64.decode(base64Audio, Base64.NO_WRAP)
            val tmpFile = File(cacheDir, "jarvis_resp_${System.currentTimeMillis()}.mp3")
            tmpFile.writeBytes(audioBytes)

            MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                setDataSource(tmpFile.absolutePath)
                prepare()
                start()
                setOnCompletionListener { mp ->
                    mp.release()
                    tmpFile.delete()
                }
                setOnErrorListener { mp, _, _ ->
                    mp.release()
                    tmpFile.delete()
                    false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Audio playback failed: ${e.message}")
        }
    }

    // ─── Notifications ────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Jarvis active for earbud commands"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jarvis AI")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun showResultNotification(text: String) {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 1, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jarvis")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        getSystemService(NotificationManager::class.java).notify(RESULT_NOTIFICATION_ID, notification)
    }
}
