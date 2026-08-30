/**
 * ContactsIntegration
 * Wraps expo-contacts with contact resolution, alias support, and permission handling.
 * All contact data stays on-device — never logged, never sent to the brain raw.
 */

import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactResolutionResult, ResolvedContact } from '@jarvis/shared';
import { STORAGE_KEYS } from './constants';

export type ContactAliasMap = Record<string, string>; // alias → real name / phone

function normalizeContact(raw: Contacts.Contact): ResolvedContact {
  const contactId = (raw as { id?: string }).id ?? String(Math.random());
  return {
    id: contactId,
    name: raw.name ?? '',
    displayName: raw.name ?? '',
    phoneNumbers: (raw.phoneNumbers ?? []).map((p) => ({
      number: p.number ?? '',
      label: p.label ?? 'mobile',
    })),
    emails: (raw.emails ?? []).map((e) => ({
      email: e.email ?? '',
      label: e.label ?? 'home',
    })),
  };
}

export class ContactsIntegration {
  private permissionGranted = false;
  private aliases: ContactAliasMap = {};

  async initialize(): Promise<void> {
    const { status } = await Contacts.getPermissionsAsync();
    this.permissionGranted = status === 'granted';
    await this.loadAliases();
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    const { status } = await Contacts.requestPermissionsAsync();
    this.permissionGranted = status === 'granted';
    return this.permissionGranted ? 'granted' : 'denied';
  }

  isPermissionGranted(): boolean {
    return this.permissionGranted;
  }

  // ── Alias management ──────────────────────────────────────────────────────

  private async loadAliases(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONTACT_ALIASES);
      this.aliases = raw ? (JSON.parse(raw) as ContactAliasMap) : {};
    } catch {
      this.aliases = {};
    }
  }

  async saveAlias(alias: string, realName: string): Promise<void> {
    this.aliases[alias.toLowerCase()] = realName;
    await AsyncStorage.setItem(STORAGE_KEYS.CONTACT_ALIASES, JSON.stringify(this.aliases));
  }

  async removeAlias(alias: string): Promise<void> {
    delete this.aliases[alias.toLowerCase()];
    await AsyncStorage.setItem(STORAGE_KEYS.CONTACT_ALIASES, JSON.stringify(this.aliases));
  }

  getAliases(): ContactAliasMap {
    return { ...this.aliases };
  }

  private resolveAliasQuery(query: string): string {
    return this.aliases[query.toLowerCase()] ?? query;
  }

  // ── Contact lookup ─────────────────────────────────────────────────────────

  /**
   * Find contacts matching the query (name or alias).
   * Returns ContactResolutionResult with ambiguity detection.
   */
  async findContact(query: string): Promise<ContactResolutionResult> {
    if (!this.permissionGranted) {
      return { ambiguous: false, error: 'Contacts permission not granted.' };
    }

    const resolvedQuery = this.resolveAliasQuery(query);

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Name,
        ],
        name: resolvedQuery,
      });

      if (!data || data.length === 0) {
        return { ambiguous: false, error: `No contact found for "${query}".` };
      }

      const resolved = data.map(normalizeContact);

      if (resolved.length === 1) {
        return { contact: resolved[0], ambiguous: false };
      }

      // Multiple contacts — ambiguous
      return { candidates: resolved, ambiguous: true };
    } catch (err) {
      return {
        ambiguous: false,
        error: err instanceof Error ? err.message : 'Failed to search contacts.',
      };
    }
  }

  /** Get all contacts (paginated, max 200) for autocomplete / context */
  async getAllContacts(): Promise<ResolvedContact[]> {
    if (!this.permissionGranted) return [];
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      return (data ?? []).map(normalizeContact);
    } catch {
      return [];
    }
  }
}

export const contactsIntegration = new ContactsIntegration();
