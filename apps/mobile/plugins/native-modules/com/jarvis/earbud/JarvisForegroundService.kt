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
import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import android.provider.MediaStore
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import com.jarvis.notification.JarvisNotificationListenerService
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

        // Auto-stop recording after this many ms of silence (allows natural speaking pauses)
        private const val SILENCE_THRESHOLD_MS = 4500L
        // Timeout when user never spoke at all (cancels without sending to brain)
        private const val NO_SPEECH_TIMEOUT_MS = 3800L
        private const val SPEECH_AMPLITUDE = 3200
        private const val SILENCE_AMPLITUDE = 1600

        // Max recording duration
        private const val MAX_RECORD_MS = 25_000L

        @Volatile
        private var brainUrl: String = "https://brainofjarvis.vercel.app/api/v1"
    }

    // ─── State ────────────────────────────────────────────────────────────────

    private enum class State { IDLE, RECORDING, PROCESSING }

    @Volatile
    private var state = State.IDLE

    private var lastTapTs = 0L
    private var userSpoke = false

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

            if (amplitude >= SPEECH_AMPLITUDE) {
                userSpoke = true
                silenceStartTs = 0L
            } else if (amplitude < SILENCE_AMPLITUDE) {
                if (userSpoke) {
                    if (silenceStartTs == 0L) silenceStartTs = System.currentTimeMillis()
                    else if (System.currentTimeMillis() - silenceStartTs >= SILENCE_THRESHOLD_MS) {
                        Log.d(TAG, "Silence detected after speech → stopping and sending to brain")
                        stopNativeRecording(sendToBrain = true)
                        return
                    }
                } else {
                    if (silenceStartTs == 0L) silenceStartTs = System.currentTimeMillis()
                    else if (System.currentTimeMillis() - silenceStartTs >= NO_SPEECH_TIMEOUT_MS) {
                        Log.d(TAG, "No speech detected during listen window → peacefully returning to IDLE without calling brain")
                        stopNativeRecording(sendToBrain = false)
                        return
                    }
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
            stopNativeRecording(sendToBrain = userSpoke)
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
                when (state) {
                    State.IDLE -> {
                        if (JarvisEarbudModule.isAppInForeground()) {
                            JarvisEarbudModule.emitEarbudEvent("DOUBLE_TAP")
                        } else {
                            startNativeRecording()
                        }
                    }
                    State.RECORDING -> stopNativeRecording()
                    State.PROCESSING -> {}
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

    // ─── Native audio feedback (PCM Chimes matching the mobile app) ───────────

    private fun playChimePcm(
        freq1: Double,
        dur1Ms: Int,
        freq2: Double,
        dur2Ms: Int,
        volume: Float = 1.0f,
        onComplete: (() -> Unit)? = null
    ) {
        Thread {
            try {
                val sampleRate = 22050
                val totalFrames = ((sampleRate * (dur1Ms + dur2Ms)) / 1000)
                val t1Frames = (sampleRate * dur1Ms) / 1000
                val t2Frames = totalFrames - t1Frames

                val pcm = ShortArray(totalFrames)

                // Tone 1 with smooth bell envelope
                for (i in 0 until t1Frames) {
                    val t = i.toDouble() / sampleRate
                    val env = Math.sin(Math.PI * i / t1Frames)
                    val sample = Math.sin(2.0 * Math.PI * freq1 * t) * env * 0.85
                    pcm[i] = (sample * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
                }

                // Tone 2 with smooth bell envelope
                for (i in 0 until t2Frames) {
                    val t = i.toDouble() / sampleRate
                    val env = Math.sin(Math.PI * i / t2Frames)
                    val sample = Math.sin(2.0 * Math.PI * freq2 * t) * env * 0.90
                    pcm[t1Frames + i] = (sample * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
                }

                val bufferSize = totalFrames * 2
                val track = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    AudioTrack.Builder()
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
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

                track.write(pcm, 0, pcm.size)
                track.setVolume(volume)
                track.play()
                Thread.sleep((dur1Ms + dur2Ms + 80).toLong())
                track.stop()
                track.release()
            } catch (e: Exception) {
                Log.w(TAG, "Chime playback error: ${e.message}")
            } finally {
                onComplete?.let { mainHandler.post(it) }
            }
        }.start()
    }

    private fun playWakeChime(onComplete: (() -> Unit)? = null) =
        playChimePcm(587.33, 140, 880.0, 220, 1.0f, onComplete)

    private fun playProcessChime(onComplete: (() -> Unit)? = null) =
        playChimePcm(1046.5, 90, 1318.5, 120, 1.0f, onComplete)

    private fun playErrorChime(onComplete: (() -> Unit)? = null) =
        playChimePcm(392.0, 150, 311.13, 200, 1.0f, onComplete)

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
        pauseSilentAudioCarrier()

        // 1. Play the wake chime in full through earbuds FIRST
        playWakeChime {
            // 2. ONLY THEN switch state to RECORDING and start mic recording
            if (state != State.IDLE) return@playWakeChime
            state = State.RECORDING
            silenceStartTs = 0L
            userSpoke = false
            updateNotification("🎙 Listening… Tap earbud to stop")

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

                // Start silence-detection polling directly
                mainHandler.postDelayed(silencePoller, 300)

                // Hard cap on recording duration
                mainHandler.postDelayed(maxDurationStopper, MAX_RECORD_MS)

            } catch (e: Exception) {
                Log.e(TAG, "Recording start failed: ${e.message}", e)
                releaseBluetoothAudioRouting()
                cleanupRecorder()
                resumeSilentAudioCarrier()
                state = State.IDLE
                updateNotification("Jarvis · Tap earbud to speak")
                playErrorChime()
            }
        }
    }

    private fun stopNativeRecording(sendToBrain: Boolean = true) {
        if (state != State.RECORDING) return

        mainHandler.removeCallbacks(silencePoller)
        mainHandler.removeCallbacks(maxDurationStopper)

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

        if (!sendToBrain || file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            state = State.IDLE
            resumeSilentAudioCarrier()
            updateNotification("Jarvis · Tap earbud to speak")
            return
        }

        // 1. Play the process chime in full through earbuds FIRST
        playProcessChime {
            // 2. ONLY THEN switch state to PROCESSING and call brain
            state = State.PROCESSING
            updateNotification("🧠 Thinking…")

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
                    playErrorChime()
                    showResultNotification("Jarvis couldn't process that. Try again.")
                    updateNotification("Jarvis · Tap earbud to speak")
                }
            }.start()
        }
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

    private fun buildNativePhoneContext(): JSONObject {
        val phoneContext = JSONObject()
        val notifListener = JarvisNotificationListenerService.instance
        val isConnected = JarvisNotificationListenerService.isServiceConnected

        val capabilities = JSONObject().apply {
            put("contacts", false)
            put("phoneCall", true)
            put("sms", true)
            put("notificationListener", isConnected)
            put("notificationReply", isConnected)
            put("openApp", true)
        }
        phoneContext.put("capabilities", capabilities)
        phoneContext.put(
            "timestamp",
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.format(java.util.Date())
        )

        val notificationsArray = JSONArray()
        try {
            val active = notifListener?.activeNotifications
            if (active != null) {
                val maxItems = Math.min(active.size, 20)
                for (i in 0 until maxItems) {
                    val sbn = active[i]
                    val notif = sbn.notification ?: continue
                    val extras = notif.extras ?: continue
                    val pkg = sbn.packageName ?: ""

                    val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: ""
                    val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: ""
                    val bigText = extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT)?.toString() ?: text
                    val subText = extras.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
                    val convTitle = extras.getCharSequence(android.app.Notification.EXTRA_CONVERSATION_TITLE)?.toString() ?: ""

                    val sender = when {
                        title.isNotBlank() -> title
                        convTitle.isNotBlank() -> convTitle
                        subText.isNotBlank() -> subText
                        else -> pkg
                    }
                    val content = when {
                        bigText.isNotBlank() -> bigText
                        text.isNotBlank() -> text
                        else -> ""
                    }

                    val appName = when {
                        pkg.contains("whatsapp") -> "whatsapp"
                        pkg.contains("telegram") -> "telegram"
                        pkg.contains("instagram") -> "instagram"
                        pkg.contains("messaging") || pkg.contains("mms") -> "sms"
                        pkg.contains("gm") || pkg.contains("email") -> "gmail"
                        else -> pkg.substringAfterLast('.')
                    }

                    val notifObj = JSONObject().apply {
                        put("id", sbn.key ?: sbn.id.toString())
                        put("app", appName)
                        put("packageName", pkg)
                        put("sender", sender)
                        put("content", content)
                        put(
                            "timestamp",
                            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                            }.format(java.util.Date(sbn.postTime))
                        )
                        put("canReply", isConnected)
                    }
                    notificationsArray.put(notifObj)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error collecting notifications for phoneContext: ${e.message}")
        }
        phoneContext.put("recentNotifications", notificationsArray)
        return phoneContext
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
                put("phoneContext", buildNativePhoneContext())
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
                    playErrorChime()
                    showResultNotification("Jarvis: couldn't connect ($code). Try again.")
                    updateNotification("Jarvis · Tap earbud to speak")
                    return
                }

                val responseStr = response.body?.string() ?: "{}"
                val rootJson = JSONObject(responseStr)
                val dataJson = rootJson.optJSONObject("data")

                val textResponse = (dataJson?.optString("response") ?: rootJson.optString("response", "")).trim()
                val audioB64 = (dataJson?.optString("audioBase64") ?: rootJson.optString("audioBase64", "")).trim()
                val continuous = dataJson?.optBoolean("continuousListening", true) ?: rootJson.optBoolean("continuousListening", true)
                val phoneAction = dataJson?.optJSONObject("pendingPhoneAction") ?: rootJson.optJSONObject("pendingPhoneAction")

                Log.d(TAG, "Brain response: text len=${textResponse.length}, audio len=${audioB64.length}, action=${phoneAction?.optString("type")}")

                // If Brain returned an empty silence turn, remain in IDLE without speaking or restarting listening
                if (textResponse.isEmpty() && audioB64.isEmpty()) {
                    Log.d(TAG, "Empty/silence response received from brain; remaining peacefully in IDLE")
                    updateNotification("Jarvis · Tap earbud to speak")
                    return
                }

                // If phone action is executing, do not restart listening
                val shouldAutoListen = continuous && (phoneAction == null)

                // Execute phone action immediately without delaying for audio playback
                if (phoneAction != null) {
                    executeNativePhoneAction(phoneAction)
                }

                // Play audio response through earbuds if available
                if (audioB64.isNotEmpty()) {
                    playAudioResponse(audioB64, autoListenAfter = shouldAutoListen)
                } else if (shouldAutoListen && textResponse.isNotEmpty()) {
                    mainHandler.postDelayed({
                        if (state == State.IDLE) {
                            startNativeRecording()
                        }
                    }, 800)
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
            playErrorChime()
            showResultNotification("Jarvis: network error. Check your connection.")
            updateNotification("Jarvis · Tap earbud to speak")
        }
    }

    // ─── Audio playback ───────────────────────────────────────────────────────

    private fun playAudioResponse(
        base64Audio: String,
        autoListenAfter: Boolean = true,
        onComplete: (() -> Unit)? = null
    ) {
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
                    onComplete?.invoke()
                    if (autoListenAfter) {
                        mainHandler.postDelayed({
                            if (state == State.IDLE) {
                                Log.d(TAG, "Continuous conversation: auto-starting native recording after speech")
                                startNativeRecording()
                            }
                        }, 400)
                    } else {
                        Log.d(TAG, "Conversation finished; staying in IDLE")
                    }
                }
                setOnErrorListener { mp, _, _ ->
                    mp.release()
                    tmpFile.delete()
                    onComplete?.invoke()
                    false
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Audio playback failed: ${e.message}", e)
            onComplete?.invoke()
        }
    }

    // ─── Native Phone Actions ─────────────────────────────────────────────────

    private fun executeNativePhoneAction(action: JSONObject) {
        val type = action.optString("type").ifEmpty { action.optString("action") }
        mainHandler.post {
            try {
                when (type) {
                    "OPEN_APP" -> {
                        val app = action.optString("app").lowercase().replace(Regex("[^a-z0-9_]"), "")
                        val targetPackage = when (app) {
                            "whatsapp" -> "com.whatsapp"
                            "whatsapp_business" -> "com.whatsapp.w4b"
                            "instagram" -> "com.instagram.android"
                            "telegram" -> "org.telegram.messenger"
                            "youtube" -> "com.google.android.youtube"
                            "spotify" -> "com.spotify.music"
                            "chrome" -> "com.android.chrome"
                            "gmail" -> "com.google.android.gm"
                            "maps" -> "com.google.android.apps.maps"
                            "calculator" -> "com.google.android.calculator"
                            "photos" -> "com.google.android.apps.photos"
                            "calendar" -> "com.google.android.calendar"
                            "clock" -> "com.google.android.deskclock"
                            "uber" -> "com.ubercab"
                            "swiggy" -> "in.swiggy.android"
                            "zomato" -> "com.application.zomato"
                            "phonepe" -> "com.phonepe.app"
                            "paytm" -> "net.one97.paytm"
                            else -> if (app.startsWith("com.")) app else null
                        }

                        var launched = false
                        if (targetPackage != null) {
                            var intent = packageManager.getLaunchIntentForPackage(targetPackage)
                            if (intent == null && targetPackage == "com.whatsapp") {
                                intent = packageManager.getLaunchIntentForPackage("com.whatsapp.w4b")
                            }
                            if (intent != null) {
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                                startActivity(intent)
                                launched = true
                                Log.d(TAG, "Native launched application package: $targetPackage")
                            }
                        }

                        if (!launched) {
                            // Fallback to Uri scheme
                            val uriScheme = when (app) {
                                "whatsapp" -> "whatsapp://send"
                                "whatsapp_business" -> "whatsapp://send"
                                "instagram" -> "instagram://app"
                                "youtube" -> "vnd.youtube://"
                                "spotify" -> "spotify://"
                                "telegram" -> "tg://"
                                "chrome" -> "googlechrome://"
                                "maps" -> "geo:0,0"
                                else -> if (app.isNotBlank()) "$app://" else null
                            }
                            if (uriScheme != null) {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriScheme)).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                                startActivity(intent)
                                Log.d(TAG, "Native launched app via URI scheme: $uriScheme")
                            }
                        }
                    }

                    "CALL_CONTACT" -> {
                        val phoneNum = action.optString("phoneNumber")
                        val contactName = action.optString("contactName")
                        val callType = action.optString("callType", "voice")
                        val targetApp = action.optString("app", "phone")
                        val isVideo = callType.equals("video", ignoreCase = true)
                        val isWhatsApp = targetApp.contains("whatsapp", ignoreCase = true)
                        var numberToCall = phoneNum.ifEmpty { contactName }

                        // If not digits, query Contacts Provider
                        val cleanDigits = numberToCall.replace(Regex("[^0-9+*#]"), "")
                        if (cleanDigits.length < 7 && contactName.isNotBlank()) {
                            try {
                                val cursor = contentResolver.query(
                                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                                    arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                                    "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
                                    arrayOf("%$contactName%"),
                                    null
                                )
                                cursor?.use {
                                    if (it.moveToFirst()) {
                                        numberToCall = it.getString(0)
                                    }
                                }
                            } catch (e: Exception) {
                                Log.w(TAG, "Contacts resolution error: ${e.message}")
                            }
                        }

                        val finalDigits = numberToCall.replace(Regex("[^0-9+*#]"), "")
                        if (finalDigits.isNotBlank()) {
                            if (isWhatsApp) {
                                val mimeType = if (isVideo) {
                                    "vnd.android.cursor.item/vnd.com.whatsapp.video.call"
                                } else {
                                    "vnd.android.cursor.item/vnd.com.whatsapp.voip.call"
                                }
                                var dataId: Long? = null
                                try {
                                    val pureDigits = finalDigits.replace(Regex("[^0-9]"), "")
                                    val cursor = contentResolver.query(
                                        ContactsContract.Data.CONTENT_URI,
                                        arrayOf(ContactsContract.Data._ID),
                                        "${ContactsContract.Data.MIMETYPE} = ? AND ${ContactsContract.Data.DATA1} LIKE ?",
                                        arrayOf(mimeType, "%$pureDigits%"),
                                        null
                                    )
                                    cursor?.use {
                                        if (it.moveToFirst()) {
                                            dataId = it.getLong(0)
                                        }
                                    }
                                } catch (ce: Exception) {
                                    Log.w(TAG, "Contacts query for WhatsApp call error: ${ce.message}")
                                }

                                if (dataId != null) {
                                    val waIntent = Intent(Intent.ACTION_VIEW).apply {
                                        setDataAndType(
                                            ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, dataId!!),
                                            mimeType
                                        )
                                        setPackage("com.whatsapp")
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                    startActivity(waIntent)
                                    Log.d(TAG, "Native initiated WhatsApp call to: $finalDigits (video=$isVideo)")
                                } else {
                                    val pureDigits = finalDigits.replace(Regex("[^0-9]"), "")
                                    val waUri = Uri.parse("https://wa.me/$pureDigits")
                                    val waIntent = Intent(Intent.ACTION_VIEW, waUri).apply {
                                        setPackage("com.whatsapp")
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                    startActivity(waIntent)
                                    Log.d(TAG, "Native initiated WhatsApp chat to: $finalDigits")
                                }
                            } else {
                                val uri = Uri.parse("tel:$finalDigits")
                                val isCallPermGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                    checkSelfPermission(android.Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
                                } else {
                                    true
                                }
                                val callIntent = if (isCallPermGranted) {
                                    Intent(Intent.ACTION_CALL, uri).apply {
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        if (isVideo) {
                                            putExtra("android.telecom.extra.START_CALL_WITH_VIDEO_STATE", 3)
                                            putExtra("android.telephony.extra.IS_VIDEO_CALL", true)
                                        }
                                    }
                                } else {
                                    Intent(Intent.ACTION_DIAL, uri).apply {
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        if (isVideo) {
                                            putExtra("android.telecom.extra.START_CALL_WITH_VIDEO_STATE", 3)
                                            putExtra("android.telephony.extra.IS_VIDEO_CALL", true)
                                        }
                                    }
                                }
                                startActivity(callIntent)
                                Log.d(TAG, "Native initiated phone call to: $finalDigits (video=$isVideo)")
                            }
                        }
                    }

                    "SEND_SMS" -> {
                        val phoneNum = action.optString("phoneNumber")
                        val contactName = action.optString("contactName")
                        val message = action.optString("message")
                        val number = phoneNum.ifEmpty { contactName }.replace(Regex("[^0-9+*#]"), "")
                        val uri = Uri.parse("sms:$number")
                        val smsIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                            putExtra("sms_body", message)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(smsIntent)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to execute native phone action: ${e.message}", e)
            }
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
