package com.jarvis.earbud

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.KeyEvent

/**
 * Receives Android MEDIA_BUTTON broadcasts (sent by Bluetooth earbuds via AVRCP).
 * Forwards key-down events to JarvisForegroundService so the service can decide
 * whether to emit to JS or handle recording natively.
 *
 * Declared in AndroidManifest.xml with android.intent.action.MEDIA_BUTTON intent-filter.
 */
class JarvisMediaButtonReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MEDIA_BUTTON) return

        val keyEvent: KeyEvent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
        }

        // Only act on key-down to avoid double-firing (Android sends both ACTION_DOWN + ACTION_UP)
        if (keyEvent?.action != KeyEvent.ACTION_DOWN) return

        val serviceIntent = Intent(context, JarvisForegroundService::class.java).apply {
            action = JarvisForegroundService.ACTION_MEDIA_BUTTON
            putExtra(JarvisForegroundService.EXTRA_KEY_CODE, keyEvent.keyCode)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
