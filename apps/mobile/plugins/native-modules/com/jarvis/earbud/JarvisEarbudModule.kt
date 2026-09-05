package com.jarvis.earbud

import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
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
        private const val TAG = "JarvisEarbudModule"
        const val MODULE_NAME = "JarvisEarbudModule"
        const val EARBUD_TAP_EVENT = "JarvisEarbudTap"

        @Volatile
        private var instance: JarvisEarbudModule? = null

        /** Called by JarvisForegroundService to emit an event to the JS layer. Returns true if delivered. */
        fun emitEarbudEvent(eventType: String): Boolean {
            val mod = instance ?: return false
            return mod.emitToJS(EARBUD_TAP_EVENT, eventType)
        }

        /**
         * Returns true only if the React Native app is active and in the foreground (resumed).
         * When true, media button taps should route to the JS layer.
         */
        fun isAppInForeground(): Boolean {
            val ctx = instance?.reactContext ?: return false
            val isAlive = try {
                ctx.hasActiveReactInstance()
            } catch (_: Throwable) {
                @Suppress("DEPRECATION")
                ctx.hasActiveCatalystInstance()
            }
            if (!isAlive) return false
            return ctx.lifecycleState == LifecycleState.RESUMED
        }

        /** Returns true if the React context is alive and JS can receive events. */
        fun isReactContextAlive(): Boolean {
            val ctx = instance?.reactContext ?: return false
            return try {
                ctx.hasActiveReactInstance()
            } catch (_: Throwable) {
                @Suppress("DEPRECATION")
                ctx.hasActiveCatalystInstance()
            }
        }
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

    private fun emitToJS(eventName: String, data: String): Boolean {
        return try {
            val isAlive = try {
                reactContext.hasActiveReactInstance()
            } catch (_: Throwable) {
                @Suppress("DEPRECATION")
                reactContext.hasActiveCatalystInstance()
            }
            if (isAlive) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, data)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit $eventName to JS: ${e.message}")
            false
        }
    }

    override fun invalidate() {
        super.invalidate()
        if (instance === this) instance = null
    }
}
