/**
 * PhoneIntegration
 * Native phone calls and SMS via Android Linking API.
 *
 * SMS strategy:
 *  - Primary: expo-sms (opens pre-filled SMS composer with body ready to send).
 *    This is a deliberate UX choice — direct background SMS requires a custom
 *    native module which is not available in Expo Go. The composer approach
 *    keeps full message control with the user and complies with Android policies.
 *  - In APK builds, this module can be swapped for react-native-sms silent send.
 *
 * Phone calls:
 *  - Uses Linking.openURL('tel:...') — works in Expo Go and APK.
 */

import { Linking, NativeModules, Platform } from 'react-native';
import * as SMS from 'expo-sms';
import { ActionResult, ResolvedContact } from '@jarvis/shared';

export class PhoneIntegration {
  /** Initiate a voice or video call via native dialer or WhatsApp. */
  async makeCall(
    contact: ResolvedContact,
    callType: 'voice' | 'video' = 'voice',
    app: string = 'phone'
  ): Promise<ActionResult> {
    const number = contact.phoneNumbers[0]?.number;
    if (!number) {
      return {
        success: false,
        error: `No phone number found for ${contact.displayName}.`,
      };
    }

    const sanitized = number.replace(/[^0-9+*#]/g, '');
    const isWhatsApp = app.toLowerCase().includes('whatsapp');
    const isVideo = callType === 'video';

    // 1. WhatsApp voice or video call flow
    if (isWhatsApp) {
      if (Platform.OS === 'android') {
        if (NativeModules.JarvisEarbudModule?.makeWhatsAppCall) {
          try {
            await NativeModules.JarvisEarbudModule.makeWhatsAppCall(sanitized, isVideo);
            return {
              success: true,
              message: `Starting WhatsApp ${isVideo ? 'video ' : ''}call with ${contact.displayName}.`,
            };
          } catch {
            // Fall through
          }
        }
        if (NativeModules.JarvisNotificationListener?.makeWhatsAppCall) {
          try {
            await NativeModules.JarvisNotificationListener.makeWhatsAppCall(sanitized, isVideo);
            return {
              success: true,
              message: `Starting WhatsApp ${isVideo ? 'video ' : ''}call with ${contact.displayName}.`,
            };
          } catch {
            // Fall through
          }
        }
      }

      // In Expo Go or when native WhatsApp call is unhandled:
      // Open that contact's chat directly in WhatsApp so call & video call buttons are ready at top-right!
      try {
        const cleanDigits = sanitized.replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/${cleanDigits}`;
        await Linking.openURL(waUrl);
        return {
          success: true,
          message: `Opening WhatsApp with ${contact.displayName}.`,
        };
      } catch {
        // Fall back to phone dialer
      }
    }

    // 2. Standard phone / cellular call flow
    const url = `tel:${sanitized}`;

    try {
      if (Platform.OS === 'android') {
        if (NativeModules.JarvisEarbudModule?.makeCall) {
          try {
            await NativeModules.JarvisEarbudModule.makeCall(sanitized, isVideo);
            return {
              success: true,
              message: `Calling ${contact.displayName}${isVideo ? ' with video' : ''}.`,
            };
          } catch {
            // Fall through
          }
        }
        if (NativeModules.JarvisNotificationListener?.makeCall) {
          try {
            await NativeModules.JarvisNotificationListener.makeCall(sanitized, isVideo);
            return {
              success: true,
              message: `Calling ${contact.displayName}${isVideo ? ' with video' : ''}.`,
            };
          } catch {
            // Fall through
          }
        }
      }

      await Linking.openURL(url);
      return { success: true, message: `Calling ${contact.displayName}.` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to initiate call.',
      };
    }
  }

  /** Send SMS — attempts direct silent background SMS via native module, or composer fallback. */
  async sendSms(contact: ResolvedContact, message: string): Promise<ActionResult> {
    const number = contact.phoneNumbers[0]?.number;
    if (!number) {
      return {
        success: false,
        error: `No phone number found for ${contact.displayName}.`,
      };
    }

    const sanitized = number.replace(/[^0-9+]/g, '');

    // 1. Try silent background SMS via native Android module (APK builds)
    if (Platform.OS === 'android') {
      const nativeModule = NativeModules.JarvisNotificationListener || NativeModules.JarvisEarbudModule;
      if (nativeModule?.sendDirectSms) {
        try {
          const sent = await nativeModule.sendDirectSms(sanitized, message);
          if (sent) {
            return { success: true, message: `Message sent to ${contact.displayName}.` };
          }
        } catch {
          // Fall through to composer fallback
        }
      }
    }

    // 2. Fallback for Expo Go: opens composer
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        return this.sendSmsViaLinking(number, message);
      }

      const { result } = await SMS.sendSMSAsync([sanitized], message);

      if (result === 'sent' || result === 'unknown') {
        return { success: true, message: `SMS ready to send to ${contact.displayName}.` };
      }
      return {
        success: false,
        error: `SMS ${result}.`,
        fallbackUsed: false,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send SMS.',
      };
    }
  }

  private async sendSmsViaLinking(number: string, body: string): Promise<ActionResult> {
    const sanitized = number.replace(/\s+/g, '');
    const url = Platform.OS === 'android'
      ? `sms:${sanitized}?body=${encodeURIComponent(body)}`
      : `sms:${sanitized}&body=${encodeURIComponent(body)}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        return { success: false, error: 'Cannot open SMS app.' };
      }
      await Linking.openURL(url);
      return {
        success: true,
        fallbackUsed: true,
        fallbackReason: 'expo-sms unavailable; opened SMS app.',
        message: 'Opening SMS to send.',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to open SMS.',
      };
    }
  }

  /** Check if the device can make calls */
  async canMakeCall(): Promise<boolean> {
    return Linking.canOpenURL('tel:0');
  }

  /** Check if SMS is available */
  async canSendSms(): Promise<boolean> {
    try {
      return SMS.isAvailableAsync();
    } catch {
      return false;
    }
  }
}

export const phoneIntegration = new PhoneIntegration();
