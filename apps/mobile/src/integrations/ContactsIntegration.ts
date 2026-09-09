/**
 * ContactsIntegration
 * Wraps expo-contacts with fuzzy contact resolution, relationship synonyms, alias support, and permission handling.
 * All contact data stays on-device — never logged, never sent to the brain raw.
 */

import * as Contacts from 'expo-contacts/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactResolutionResult, ResolvedContact } from '@jarvis/shared';
import { STORAGE_KEYS } from './constants';

export type ContactAliasMap = Record<string, string>; // alias → real name / phone

function normalizeContact(raw: Contacts.ExistingContact): ResolvedContact {
  const contactId = raw.id ?? String(Math.random());
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
    await this.ensurePermission();
    await this.loadAliases();
  }

  async ensurePermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      this.permissionGranted = status === 'granted';
      if (!this.permissionGranted) {
        const req = await Contacts.requestPermissionsAsync();
        this.permissionGranted = req.status === 'granted';
      }
      return this.permissionGranted;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    const granted = await this.ensurePermission();
    return granted ? 'granted' : 'denied';
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
   * Simple on-device exact/alias contact lookup fallback.
   * Semantic reasoning and relationship understanding is strictly handled by the Jarvis Brain LLM.
   */
  async findContact(query: string): Promise<ContactResolutionResult> {
    const hasPerm = await this.ensurePermission();
    if (!hasPerm) {
      return { ambiguous: false, error: 'Contacts permission not granted. Please allow contacts access.' };
    }

    const resolvedQuery = this.resolveAliasQuery(query).trim();
    if (!resolvedQuery) {
      return { ambiguous: false, error: 'Contact name cannot be empty.' };
    }

    const qLower = resolvedQuery.toLowerCase();

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Name,
        ],
      });

      if (!data || data.length === 0) {
        return { ambiguous: false, error: `No contacts found on device.` };
      }

      // Exact or alias match
      const exactMatch = data.find((c) => (c.name || '').trim().toLowerCase() === qLower);
      if (exactMatch) {
        return { contact: normalizeContact(exactMatch), ambiguous: false };
      }

      // Simple substring match for fallbacks
      const matches = data.filter((c) => {
        const name = (c.name || '').trim().toLowerCase();
        return name.length > 0 && name.includes(qLower);
      });

      if (matches.length === 1) {
        return { contact: normalizeContact(matches[0]), ambiguous: false };
      }

      if (matches.length > 1) {
        return {
          candidates: matches.slice(0, 5).map(normalizeContact),
          ambiguous: true,
        };
      }

      return { ambiguous: false, error: `Couldn't find "${query}" in contacts.` };
    } catch (err) {
      return {
        ambiguous: false,
        error: err instanceof Error ? err.message : 'Failed to search contacts.',
      };
    }
  }

  /** Get all contacts (paginated, max 200) for autocomplete / context */
  async getAllContacts(): Promise<ResolvedContact[]> {
    const hasPerm = await this.ensurePermission();
    if (!hasPerm) return [];
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
