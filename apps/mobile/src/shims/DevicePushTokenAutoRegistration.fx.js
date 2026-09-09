/**
 * Safe shim for DevicePushTokenAutoRegistration.fx in Expo Go.
 * Disables background remote push token registration loops inside Expo Go
 * while allowing local notifications and routes to evaluate cleanly.
 */

export async function setAutoServerRegistrationEnabledAsync(_enabled) {
  // Remote push token auto-registration is disabled in Expo Go
}

export async function __handlePersistedRegistrationInfoAsync(_registrationInfo) {
  // No-op in Expo Go
}
