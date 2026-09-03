package com.jarvis.notification

import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class JarvisNotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var receiverRegistered = false

    private val notificationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return

            val eventName = when (intent.action) {
                JarvisNotificationListenerService.ACTION_NOTIFICATION_POSTED -> "onNotificationPosted"
                JarvisNotificationListenerService.ACTION_NOTIFICATION_REMOVED -> "onNotificationRemoved"
                else -> return
            }

            val params = Arguments.createMap().apply {
                putString("id", intent.getStringExtra("id") ?: "")
                putString("key", intent.getStringExtra("key") ?: "")
                putString("packageName", intent.getStringExtra("packageName") ?: "")
                putString("tag", intent.getStringExtra("tag") ?: "")
                putDouble("postTime", intent.getLongExtra("postTime", System.currentTimeMillis()).toDouble())
                putString("sender", intent.getStringExtra("sender") ?: "")
                putString("text", intent.getStringExtra("text") ?: "")
                putString("subText", intent.getStringExtra("subText") ?: "")
                putBoolean("hasReplyAction", intent.getBooleanExtra("hasReplyAction", false))
                putString("replyActionKey", intent.getStringExtra("replyActionKey") ?: "")
            }

            sendEvent(eventName, params)
        }
    }

    override fun getName(): String = "JarvisNotificationListener"

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        try {
            val packageName = reactContext.packageName
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            val isEnabled = enabledPackages.contains(packageName)
            promise.resolve(isEnabled && JarvisNotificationListenerService.isServiceConnected)
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_SERVICE", e.message, e)
        }
    }

    @ReactMethod
    fun requestListenerPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_SETTINGS", e.message, e)
        }
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        try {
            if (!receiverRegistered) {
                val filter = IntentFilter().apply {
                    addAction(JarvisNotificationListenerService.ACTION_NOTIFICATION_POSTED)
                    addAction(JarvisNotificationListenerService.ACTION_NOTIFICATION_REMOVED)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    reactContext.registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    reactContext.registerReceiver(notificationReceiver, filter)
                }
                receiverRegistered = true
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_START_LISTENING", e.message, e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        try {
            if (receiverRegistered) {
                reactContext.unregisterReceiver(notificationReceiver)
                receiverRegistered = false
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_LISTENING", e.message, e)
        }
    }

    @ReactMethod
    fun replyToNotification(replyActionKey: String, message: String, promise: Promise) {
        try {
            val action = JarvisNotificationListenerService.replyActionCache[replyActionKey]
            if (action == null) {
                promise.resolve(false)
                return
            }

            val intent = Intent()
            val bundle = Bundle().apply {
                putCharSequence(action.remoteInput.resultKey, message)
            }
            RemoteInput.addResultsToIntent(arrayOf(action.remoteInput), intent, bundle)

            action.pendingIntent.send(reactContext, 0, intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_REPLY_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in Event Emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built-in Event Emitter
    }
}
