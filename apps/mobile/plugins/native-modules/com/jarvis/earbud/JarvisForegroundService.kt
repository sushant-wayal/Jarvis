package com.jarvis.earbud

import android.app.*
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.*
import android.os.*
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media.session.MediaButtonReceiver
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
 * │  FOREGROUND MODE (app on screen, JS thread alive & resumed)     │
 * │  Tap → emitEarbudEvent("SINGLE_TAP") → JS handles UI & speech   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  BACKGROUND MODE (screen off, app minimized, in pocket)         │
 * │  Tap → native MediaRecorder (BT SCO) → Brain API (/voice)      │
 * │  Jarvis speaks the response through earbuds via MediaPlayer     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Lifecycle:
 *  - Started as a foreground service when the app initializes (earbudService.initialize())
 *  - Runs indefinitely with START_STICKY (auto-restarts if killed)
 *  - Shows an official MediaStyle notification linked to MediaSessionCompat
 *  - Plays a continuous silent AudioTrack so Android's AudioPolicy / AVRCP routes
 *    all Bluetooth earbud clicks (boAt, AirPods, etc.) to Jarvis instead of ignoring them
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

        // Tap debounce: ignore duplicate events within this window (ms)
        private const val TAP_DEBOUNCE_MS = 400L

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

    // ─── Silent Audio Carrier ─────────────────────────────────────────────────
    // Critical: Keeps Android AudioFlinger / Bluetooth AVRCP active so taps route to Jarvis
    private var silentAudioTrack: AudioTrack? = null

    // ─── MediaSession ─────────────────────────────────────────────────────────

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
        Log.d(TAG, "JarvisForegroundService created")
        createNotificationChannel()
        initMediaSession()
        startForegroundCompat(buildNotification("Jarvis · Tap earbud to speak"))
        requestAudioFocus()
        startSilentAudioCarrier()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var fgsType = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                fgsType = fgsType or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(NOTIFICATION_ID, notification, fgsType)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_MEDIA_BUTTON -> {
                val keyCode = intent.getIntExtra(EXTRA_KEY_CODE, KeyEvent.KEYCODE_UNKNOWN)
                if (keyCode != KeyEvent.KEYCODE_UNKNOWN) {
                    handleMediaButton(keyCode)
                } else {
                    mediaSession?.let { MediaButtonReceiver.handleIntent(it, intent) }
                }
            }
            Intent.ACTION_MEDIA_BUTTON -> {
                mediaSession?.let { MediaButtonReceiver.handleIntent(it, intent) }
            }
            Intent.ACTION_VOICE_COMMAND -> {
                Log.d(TAG, "ACTION_VOICE_COMMAND received from Bluetooth assistant gesture")
                handleMediaButton(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
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
        stopSilentAudioCarrier()
        cleanupRecorder()
        abandonAudioFocus()
        mediaSession?.run { isActive = false; release() }
        Log.d(TAG, "JarvisForegroundService destroyed")
    }

    // ─── MediaSession setup ───────────────────────────────────────────────────

    private fun initMediaSession() {
        val receiverComponent = ComponentName(this, JarvisMediaButtonReceiver::class.java)

        mediaSession = MediaSessionCompat(this, "JarvisEarbud", receiverComponent, null).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setMetadata(
                MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Jarvis AI")
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Tap earbud to speak")
                    .build()
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

                override fun onPlay()           { handleMediaButton(KeyEvent.KEYCODE_MEDIA_PLAY) }
                override fun onPause()          { handleMediaButton(KeyEvent.KEYCODE_MEDIA_PAUSE) }
                override fun onStop()           { handleMediaButton(KeyEvent.KEYCODE_MEDIA_STOP) }
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

    // ─── Silent Audio Carrier ─────────────────────────────────────────────────

    private fun startSilentAudioCarrier() {
        try {
            if (silentAudioTrack != null) return
            val sampleRate = 44100
            val minBufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            val bufferSize = maxOf(minBufferSize, sampleRate * 2)
            val silentBuffer = ByteArray(bufferSize)

            val track = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize,
                    AudioTrack.MODE_STATIC
                )
            }

            track.write(silentBuffer, 0, silentBuffer.size)
            track.setLoopPoints(0, bufferSize / 2, -1)
            track.setVolume(0.001f)
            track.play()
            silentAudioTrack = track
            Log.d(TAG, "Silent audio carrier active — Bluetooth AVRCP will route all earbud taps to Jarvis")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start silent audio carrier", e)
        }
    }

    private fun pauseSilentAudioCarrier() {
        try {
            silentAudioTrack?.pause()
        } catch (_: Exception) {}
    }

    private fun resumeSilentAudioCarrier() {
        try {
            if (silentAudioTrack?.playState != AudioTrack.PLAYSTATE_PLAYING) {
                silentAudioTrack?.play()
            }
        } catch (_: Exception) {}
    }

    private fun stopSilentAudioCarrier() {
        try {
            silentAudioTrack?.stop()
            silentAudioTrack?.release()
        } catch (_: Exception) {}
        silentAudioTrack = null
    }

    // ─── Media button handling ────────────────────────────────────────────────

    private fun handleMediaButton(keyCode: Int) {
        Log.d(TAG, "Media button received: keyCode=$keyCode, currentState=$state")

        val isTapKey = when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
            KeyEvent.KEYCODE_CALL -> true
            else -> false
        }

        val now = System.currentTimeMillis()
        if (isTapKey) {
            // Debounce rapid double-fires from earbuds
            if (now - lastTapTs < TAP_DEBOUNCE_MS && state == State.IDLE) {
                Log.d(TAG, "Debounced rapid duplicate tap keyCode=$keyCode")
                return
            }
            lastTapTs = now
        }

        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
            KeyEvent.KEYCODE_CALL -> {
                when (state) {
                    State.IDLE -> {
                        // Check if app is open on screen with an active React context
                        if (JarvisEarbudModule.isAppInForeground()) {
                            val eventName = when (keyCode) {
                                KeyEvent.KEYCODE_MEDIA_PLAY -> "MEDIA_PLAY"
                                KeyEvent.KEYCODE_MEDIA_PAUSE -> "MEDIA_PAUSE"
                                else -> "SINGLE_TAP"
                            }
                            val delivered = JarvisEarbudModule.emitEarbudEvent(eventName)
                            if (!delivered) {
                                Log.w(TAG, "Failed to deliver event to JS, falling back to native recording")
                                startNativeRecording()
                            }
                        } else {
                            // Background mode: phone in pocket, screen locked, or app minimized
                            startNativeRecording()
                        }
                    }
                    State.RECORDING -> stopNativeRecording()
                    State.PROCESSING -> { /* ignore taps while processing */ }
                }
            }
            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                if (JarvisEarbudModule.isAppInForeground()) {
                    JarvisEarbudModule.emitEarbudEvent("DOUBLE_TAP")
                } else if (state == State.RECORDING) {
                    stopNativeRecording()
                }
            }
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                if (JarvisEarbudModule.isAppInForeground()) {
                    JarvisEarbudModule.emitEarbudEvent("TRIPLE_TAP")
                }
            }
            KeyEvent.KEYCODE_MEDIA_STOP -> {
                if (state == State.RECORDING) stopNativeRecording()
                if (JarvisEarbudModule.isAppInForeground()) {
                    JarvisEarbudModule.emitEarbudEvent("LONG_PRESS")
                }
            }
        }
    }

    // ─── Native audio feedback ────────────────────────────────────────────────

    private fun playTone(toneType: Int, durationMs: Int = 150) {
        try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 85).run {
                startTone(toneType, durationMs)
                mainHandler.postDelayed({
                    try { release() } catch (_: Exception) {}
                }, (durationMs + 100).toLong())
            }
        } catch (e: Exception) {
            Log.w(TAG, "Tone playback error: ${e.message}")
        }
    }

    private fun enableBluetoothAudioRouting() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val commDevices = audioManager.availableCommunicationDevices
                val btDevice = commDevices.firstOrNull {
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    it.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                }
                if (btDevice != null) {
                    audioManager.setCommunicationDevice(btDevice)
                    Log.d(TAG, "Bluetooth communication device set: ${btDevice.productName}")
                }
            } else {
                @Suppress("DEPRECATION")
                audioManager.startBluetoothSco()
                @Suppress("DEPRECATION")
                audioManager.isBluetoothScoOn = true
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error configuring Bluetooth audio routing: ${e.message}")
        }
    }

    private fun releaseBluetoothAudioRouting() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            } else {
                @Suppress("DEPRECATION")
                audioManager.isBluetoothScoOn = false
                @Suppress("DEPRECATION")
                audioManager.stopBluetoothSco()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing Bluetooth audio routing: ${e.message}")
        }
    }

    // ─── Native recording pipeline ────────────────────────────────────────────

    private fun startNativeRecording() {
        if (state != State.IDLE) return
        state = State.RECORDING
        silenceStartTs = 0L

        pauseSilentAudioCarrier()
        updateNotification("🎙 Listening… Tap earbud to stop")
        playTone(ToneGenerator.TONE_PROP_BEEP, 120)

        try {
            val file = File(cacheDir, "jarvis_rec_${System.currentTimeMillis()}.m4a")
            recordingFile = file

            enableBluetoothAudioRouting()

            mediaRecorder = (
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this)
                else @Suppress("DEPRECATION") MediaRecorder()
            ).apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
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
            Log.e(TAG, "Recording start failed: ${e.message}", e)
            releaseBluetoothAudioRouting()
            cleanupRecorder()
            resumeSilentAudioCarrier()
            state = State.IDLE
            updateNotification("Jarvis · Tap earbud to speak")
            playTone(ToneGenerator.TONE_PROP_NACK, 200)
        }
    }

    private fun stopNativeRecording() {
        if (state != State.RECORDING) return
        state = State.PROCESSING

        mainHandler.removeCallbacks(silencePoller)
        mainHandler.removeCallbacks(maxDurationStopper)

        updateNotification("🧠 Thinking…")
        playTone(ToneGenerator.TONE_PROP_ACK, 100)

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
        releaseBluetoothAudioRouting()

        if (file == null || !file.exists() || file.length() == 0L) {
            state = State.IDLE
            resumeSilentAudioCarrier()
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
                Log.e(TAG, "Audio processing failed: ${e.message}", e)
                state = State.IDLE
                resumeSilentAudioCarrier()
                playTone(ToneGenerator.TONE_PROP_NACK, 200)
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
        releaseBluetoothAudioRouting()
        resumeSilentAudioCarrier()
    }

    // ─── Brain API call ───────────────────────────────────────────────────────

    private fun getVoiceApiUrl(): String {
        val clean = brainUrl.trimEnd('/')
        return if (clean.endsWith("/voice")) {
            clean
        } else if (clean.endsWith("/api/v1")) {
            "$clean/voice"
        } else {
            "$clean/api/v1/voice"
        }
    }

    private fun callBrainApi(audioBase64: String, mimeType: String) {
        val url = getVoiceApiUrl()
        Log.d(TAG, "Calling brain voice endpoint: $url")

        try {
            val bodyJson = JSONObject().apply {
                put("audioBase64", audioBase64)
                put("mimeType", mimeType)
                put("timezone", java.util.TimeZone.getDefault().id)
                put("locale", java.util.Locale.getDefault().toLanguageTag())
                put("userId", "default-user")
            }.toString()

            val request = Request.Builder()
                .url(url)
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()

            http.newCall(request).execute().use { response ->
                state = State.IDLE
                resumeSilentAudioCarrier()

                if (!response.isSuccessful) {
                    val code = response.code
                    val errorBody = response.body?.string() ?: ""
                    Log.e(TAG, "Brain API error $code: $errorBody")
                    playTone(ToneGenerator.TONE_PROP_NACK, 200)
                    showResultNotification("Jarvis: couldn't connect ($code). Try again.")
                    updateNotification("Jarvis · Tap earbud to speak")
                    return
                }

                val responseStr = response.body?.string() ?: "{}"
                val rootJson = JSONObject(responseStr)
                val dataJson = rootJson.optJSONObject("data")

                val textResponse = (dataJson?.optString("response") ?: rootJson.optString("response", "")).trim()
                val audioB64 = (dataJson?.optString("audioBase64") ?: rootJson.optString("audioBase64", "")).trim()

                Log.d(TAG, "Brain response: text len=${textResponse.length}, audio len=${audioB64.length}")

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
            resumeSilentAudioCarrier()
            Log.e(TAG, "Brain API call failed: ${e.message}", e)
            playTone(ToneGenerator.TONE_PROP_NACK, 200)
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
            Log.e(TAG, "Audio playback failed: ${e.message}", e)
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

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jarvis AI")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        mediaSession?.let { session ->
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(session.sessionToken)
            )
        }

        return builder.build()
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
