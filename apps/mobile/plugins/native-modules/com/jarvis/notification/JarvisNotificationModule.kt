package com.jarvis.notification

import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
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
    fun isPermissionGranted(promise: Promise) {
        try {
            val packageName = reactContext.packageName
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            promise.resolve(enabledPackages.contains(packageName))
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_PERMISSION", e.message, e)
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
    fun syncActiveNotifications(promise: Promise) {
        try {
            val service = JarvisNotificationListenerService.instance
            if (service != null) {
                service.syncActiveNotifications()
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_SYNC_NOTIFS", e.message, e)
        }
    }

    @ReactMethod
    fun launchApplication(packageName: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            var intent = pm.getLaunchIntentForPackage(packageName)
            if (intent == null && packageName == "com.whatsapp") {
                intent = pm.getLaunchIntentForPackage("com.whatsapp.w4b")
            }
            if (intent == null && packageName == "com.whatsapp.w4b") {
                intent = pm.getLaunchIntentForPackage("com.whatsapp")
            }
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                reactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_LAUNCH_APP", e.message, e)
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
            } catch (_: Exception) {}

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
            // Proactively sync existing notifications currently in the status bar
            JarvisNotificationListenerService.instance?.syncActiveNotifications()
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
    fun sendDirectSms(phoneNumber: String, message: String, promise: Promise) {
        try {
            val sanitized = phoneNumber.replace(Regex("[^0-9+]"), "")
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                reactContext.getSystemService(android.telephony.SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                android.telephony.SmsManager.getDefault()
            }
            val parts = smsManager.divideMessage(message)
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(sanitized, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(sanitized, null, message, null, null)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SEND_DIRECT_SMS", e.message, e)
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
