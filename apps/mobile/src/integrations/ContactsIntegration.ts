/**
 * ContactsIntegration
 * Wraps expo-contacts with fuzzy contact resolution, relationship synonyms, alias support, and permission handling.
 * All contact data stays on-device — never logged, never sent to the brain raw.
 */

import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactResolutionResult, ResolvedContact } from '@jarvis/shared';
import { STORAGE_KEYS } from './constants';

export type ContactAliasMap = Record<string, string>; // alias → real name / phone

const RELATIONSHIP_SYNONYMS: Record<string, string[]> = {
  mom: ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'],
  mummy: ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'],
  mother: ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'],
  maa: ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'],
  aai: ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'],
  dad: ['dad', 'father', 'papa', 'daddy', 'baba', 'appa', 'pitaji'],
  papa: ['dad', 'father', 'papa', 'daddy', 'baba', 'appa', 'pitaji'],
  father: ['dad', 'father', 'papa', 'daddy', 'baba', 'appa', 'pitaji'],
  baba: ['dad', 'father', 'papa', 'daddy', 'baba', 'appa', 'pitaji'],
  brother: ['bro', 'brother', 'bhai', 'bhaiya', 'dada'],
  bro: ['bro', 'brother', 'bhai', 'bhaiya', 'dada'],
  sister: ['sis', 'sister', 'behen', 'didi'],
  sis: ['sis', 'sister', 'behen', 'didi'],
};

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
   * Find contacts matching the query (name, relationship synonym, or alias).
   * Returns ContactResolutionResult with intelligent scoring and ambiguity detection.
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
    const qWords = qLower.split(/[\s,._-]+/).filter((w) => w.length > 0);
    const relationSyns = RELATIONSHIP_SYNONYMS[qLower] || [];

    try {
      // 1. Fetch contacts from device
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

      // 2. Score each contact
      interface ScoredCandidate {
        contact: Contacts.Contact;
        score: number;
        hasPhone: boolean;
      }

      const scored: ScoredCandidate[] = [];

      for (const c of data) {
        const rawName = c.name || '';
        const cLower = rawName.toLowerCase().trim();
        if (!cLower) continue;

        const cWords = cLower.split(/[\s,._-]+/).filter((w) => w.length > 0);
        const hasPhone = Boolean(c.phoneNumbers && c.phoneNumbers.length > 0);
        let score = 0;

        // Exact match
        if (cLower === qLower) {
          score = 100;
        }
        // Relationship synonym match (e.g. "mummy" matching "Mom")
        else if (relationSyns.length > 0 && relationSyns.some((syn) => cWords.includes(syn) || cLower === syn)) {
          score = 96;
        }
        // Query equals contact without whitespace/special chars
        else if (cLower.replace(/[^a-z0-9]/g, '') === qLower.replace(/[^a-z0-9]/g, '')) {
          score = 92;
        }
        // All query words present in contact (e.g. "ritam dutta" in "Ritam Dutta" or "Dutta, Ritam")
        else if (qWords.length > 1 && qWords.every((qw) => cLower.includes(qw))) {
          score = 90;
        }
        // Contact starts with query
        else if (cLower.startsWith(qLower)) {
          score = 85;
        }
        // Contact contains entire query
        else if (cLower.includes(qLower)) {
          score = 80;
        }
        // Query contains contact name
        else if (qLower.includes(cLower)) {
          score = 75;
        }
        // Overlapping words
        else {
          const matchingWords = qWords.filter((qw) => cWords.includes(qw) || cLower.includes(qw));
          if (matchingWords.length > 0) {
            score = 60 + (matchingWords.length / Math.max(qWords.length, cWords.length)) * 15;
          }
        }

        // Bonus for contacts having a valid phone number
        if (score > 0 && hasPhone) {
          score += 2;
        }

        if (score >= 60) {
          scored.push({ contact: c, score, hasPhone });
        }
      }

      scored.sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        return { ambiguous: false, error: `Couldn't find "${query}" in contacts.` };
      }

      const top = scored[0];

      // High confidence match
      if (top.score >= 80) {
        const ties = scored.filter((s) => s.score === top.score);
        if (ties.length === 1) {
          return { contact: normalizeContact(top.contact), ambiguous: false };
        }
        const tiesWithPhone = ties.filter((s) => s.hasPhone);
        if (tiesWithPhone.length === 1) {
          return { contact: normalizeContact(tiesWithPhone[0].contact), ambiguous: false };
        }
        return { candidates: ties.map((s) => normalizeContact(s.contact)), ambiguous: true };
      }

      // Decisive lead over second match
      if (scored.length === 1 || top.score >= scored[1].score + 10) {
        return { contact: normalizeContact(top.contact), ambiguous: false };
      }

      // Ambiguous multiple candidates
      return {
        candidates: scored.slice(0, 4).map((s) => normalizeContact(s.contact)),
        ambiguous: true,
      };
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
