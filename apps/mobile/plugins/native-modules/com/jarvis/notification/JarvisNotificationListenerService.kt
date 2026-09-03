package com.jarvis.notification

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class JarvisNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "JarvisNotifService"
        const val ACTION_NOTIFICATION_POSTED = "com.jarvis.notification.NOTIFICATION_POSTED"
        const val ACTION_NOTIFICATION_REMOVED = "com.jarvis.notification.NOTIFICATION_REMOVED"
        
        // Cache active reply actions by key for background RemoteInput reply execution
        val replyActionCache = mutableMapOf<String, NotificationReplyAction>()
        var isServiceConnected = false
    }

    data class NotificationReplyAction(
        val pendingIntent: PendingIntent,
        val remoteInput: RemoteInput,
        val packageName: String
    )

    override fun onListenerConnected() {
        super.onListenerConnected()
        isServiceConnected = true
        Log.i(TAG, "Jarvis NotificationListenerService connected.")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isServiceConnected = false
        Log.i(TAG, "Jarvis NotificationListenerService disconnected.")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return
        val packageName = sbn.packageName ?: return

        // Filter out system UI & ongoing sticky background services
        if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0 &&
            !packageName.contains("whatsapp") &&
            !packageName.contains("telegram") &&
            !packageName.contains("messaging")
        ) {
            return
        }

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: text
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString() ?: ""

        val finalSender = if (title.isNotBlank()) title else conversationTitle
        val finalContent = if (bigText.isNotBlank()) bigText else text

        if (finalSender.isBlank() && finalContent.isBlank()) {
            return
        }

        var hasReply = false
        var replyKey: String? = null

        // Scan notification actions for RemoteInput (Direct Reply)
        val actions = notification.actions
        if (actions != null) {
            for (action in actions) {
                val remoteInputs = action.remoteInputs
                if (remoteInputs != null && remoteInputs.isNotEmpty()) {
                    for (ri in remoteInputs) {
                        if (ri.allowFreeFormInput && action.actionIntent != null) {
                            val key = "${packageName}_${sbn.id}_${sbn.postTime}"
                            replyActionCache[key] = NotificationReplyAction(
                                pendingIntent = action.actionIntent,
                                remoteInput = ri,
                                packageName = packageName
                            )
                            hasReply = true
                            replyKey = key
                            break
                        }
                    }
                }
                if (hasReply) break
            }
        }

        val intent = Intent(ACTION_NOTIFICATION_POSTED).apply {
            putExtra("id", sbn.id.toString())
            putExtra("key", sbn.key)
            putExtra("packageName", packageName)
            putExtra("tag", sbn.tag ?: "")
            putExtra("postTime", sbn.postTime)
            putExtra("sender", finalSender)
            putExtra("text", finalContent)
            putExtra("subText", subText)
            putExtra("hasReplyAction", hasReply)
            putExtra("replyActionKey", replyKey ?: "")
            setPackage(this@JarvisNotificationListenerService.packageName)
        }

        sendBroadcast(intent)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val intent = Intent(ACTION_NOTIFICATION_REMOVED).apply {
            putExtra("id", sbn.id.toString())
            putExtra("key", sbn.key)
            putExtra("packageName", sbn.packageName)
            setPackage(this@JarvisNotificationListenerService.packageName)
        }
        sendBroadcast(intent)
    }
}
