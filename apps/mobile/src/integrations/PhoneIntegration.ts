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
  /** Open the native dialer pre-dialled to the contact's first phone number. */
  async makeCall(contact: ResolvedContact): Promise<ActionResult> {
    const number = contact.phoneNumbers[0]?.number;
    if (!number) {
      return {
        success: false,
        error: `No phone number found for ${contact.displayName}.`,
      };
    }

    const sanitized = number.replace(/[^0-9+*#]/g, '');
    const url = `tel:${sanitized}`;

    try {
      if (Platform.OS === 'android') {
        if (NativeModules.JarvisEarbudModule?.makeCall) {
          try {
            await NativeModules.JarvisEarbudModule.makeCall(sanitized);
            return { success: true, message: `Calling ${contact.displayName}.` };
          } catch {
            // Fall through
          }
        }
        if (NativeModules.JarvisNotificationListener?.makeCall) {
          try {
            await NativeModules.JarvisNotificationListener.makeCall(sanitized);
            return { success: true, message: `Calling ${contact.displayName}.` };
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

  /** Send SMS — opens the native SMS composer pre-filled. */
  async sendSms(contact: ResolvedContact, message: string): Promise<ActionResult> {
    const number = contact.phoneNumbers[0]?.number;
    if (!number) {
      return {
        success: false,
        error: `No phone number found for ${contact.displayName}.`,
      };
    }

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        // Fallback: open sms: URL
        return this.sendSmsViaLinking(number, message);
      }

      const { result } = await SMS.sendSMSAsync([number.replace(/\s+/g, '')], message);

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
