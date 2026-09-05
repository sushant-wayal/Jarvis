package com.jarvis.earbud

import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
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

    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            var intent = pm.getLaunchIntentForPackage(packageName)
            if (intent == null && packageName == "com.whatsapp") {
                intent = pm.getLaunchIntentForPackage("com.whatsapp.w4b")
            }
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                reactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_LAUNCH", e.message, e)
        }
    }

    @ReactMethod
    fun makeCall(phoneNumber: String, isVideo: Boolean, promise: Promise) {
        try {
            val sanitized = phoneNumber.replace(Regex("[^0-9+*#]"), "")
            val uri = Uri.parse("tel:$sanitized")
            val isCallPermGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                reactContext.checkSelfPermission(android.Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
            val intent = if (isCallPermGranted) {
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
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CALL", e.message, e)
        }
    }

    @ReactMethod
    fun makeWhatsAppCall(phoneNumber: String, isVideo: Boolean, promise: Promise) {
        try {
            val sanitized = phoneNumber.replace(Regex("[^0-9]"), "")
            val mimeType = if (isVideo) {
                "vnd.android.cursor.item/vnd.com.whatsapp.video.call"
            } else {
                "vnd.android.cursor.item/vnd.com.whatsapp.voip.call"
            }

            var dataId: Long? = null
            try {
                val cursor = reactContext.contentResolver.query(
                    ContactsContract.Data.CONTENT_URI,
                    arrayOf(ContactsContract.Data._ID),
                    "${ContactsContract.Data.MIMETYPE} = ? AND ${ContactsContract.Data.DATA1} LIKE ?",
                    arrayOf(mimeType, "%$sanitized%"),
                    null
                )
                cursor?.use {
                    if (it.moveToFirst()) {
                        dataId = it.getLong(0)
                    }
                }
            } catch (ce: Exception) {
                Log.w(TAG, "Contacts query for WhatsApp call failed: ${ce.message}")
            }

            if (dataId != null) {
                val callIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(
                        ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, dataId!!),
                        mimeType
                    )
                    setPackage("com.whatsapp")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(callIntent)
                promise.resolve(true)
            } else {
                // Fallback: Open WhatsApp conversation directly
                val waUri = Uri.parse("https://wa.me/$sanitized")
                val intent = Intent(Intent.ACTION_VIEW, waUri).apply {
                    setPackage("com.whatsapp")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERR_WHATSAPP_CALL", e.message, e)
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
