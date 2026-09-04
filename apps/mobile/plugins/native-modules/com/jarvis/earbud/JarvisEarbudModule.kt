package com.jarvis.earbud

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * React Native native module that bridges the JS layer to the JarvisForegroundService.
 *
 * Responsibilities:
 *  - Start / stop the foreground service from JS
 *  - Emit earbud tap events back to JS via NativeEventEmitter
 *  - Expose a static emitter so the service can fire events even when
 *    JS initiated the call (foreground mode)
 */
class JarvisEarbudModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "JarvisEarbudModule"
        const val EARBUD_TAP_EVENT = "JarvisEarbudTap"

        @Volatile
        private var instance: JarvisEarbudModule? = null

        /** Called by JarvisForegroundService to emit an event to the JS layer. */
        fun emitEarbudEvent(eventType: String) {
            instance?.emitToJS(EARBUD_TAP_EVENT, eventType)
        }

        /** Returns true if the React context is alive and JS can receive events. */
        fun isReactContextAlive(): Boolean =
            instance?.reactContext?.hasActiveCatalystInstance() == true
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    override fun getConstants(): Map<String, Any> = mapOf(
        "EARBUD_TAP_EVENT" to EARBUD_TAP_EVENT
    )

    @ReactMethod
    fun startService(brainUrl: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, JarvisForegroundService::class.java).apply {
                putExtra(JarvisForegroundService.EXTRA_BRAIN_URL, brainUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SERVICE_START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, JarvisForegroundService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SERVICE_STOP_ERROR", e.message, e)
        }
    }

    /** Required by RCTEventEmitter on the JS side */
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

    /** Required by RCTEventEmitter on the JS side */
    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    private fun emitToJS(eventName: String, data: String) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
        }
    }

    override fun invalidate() {
        super.invalidate()
        if (instance === this) instance = null
    }
}
