/**
 * Semantic Entity & Relationship Resolver
 *
 * Resolves contact queries and relationships semantically using LLM intelligence
 * while strictly masking PII (phone numbers) before evaluation.
 *
 * Accurately handles:
 * - Direct vs third-party relationships (e.g., "Mom" vs "Darshan's mom")
 * - User identity context (e.g., user is "Sushant")
 * - Disambiguation questions when only third-party matches exist
 */

import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { privacyMasker } from './privacy-masker';

export interface ContactCandidate {
  id?: string;
  name: string;
  number: string;
  label?: string;
}

export interface ResolvedContactResult {
  found: boolean;
  status: 'EXACT_MATCH' | 'AMBIGUOUS' | 'NO_MATCH';
  contact?: {
    id: string;
    name: string;
    number: string;
    label?: string;
    formatted: string;
  };
  confidence: number;
  disambiguationMessage?: string;
  reasoning?: string;
}

export class SemanticEntityResolver {
  /**
   * Resolves a contact query (e.g. "mom", "dad", "Darshan's mom", "Rahul") against a list of contacts.
   */
  async resolveContact(
    query: string,
    userName: string,
    contacts: ContactCandidate[],
    aliases: Record<string, string> = {}
  ): Promise<ResolvedContactResult> {
    const q = query.trim();
    if (!q || contacts.length === 0) {
      return {
        found: false,
        status: 'NO_MATCH',
        confidence: 0,
        reasoning: 'Empty query or empty contact list',
      };
    }

    const qLower = q.toLowerCase();

    // ── Fast Path 1: Configured Aliases ─────────────────────────────────────
    const aliasTarget = aliases[qLower];
    if (aliasTarget) {
      const aliasMatch = contacts.find(
        (c) => c.name.toLowerCase() === aliasTarget.toLowerCase()
      );
      if (aliasMatch) {
        return {
          found: true,
          status: 'EXACT_MATCH',
          contact: {
            id: aliasMatch.id || aliasMatch.name,
            name: aliasMatch.name,
            number: aliasMatch.number,
            label: aliasMatch.label || 'mobile',
            formatted: `${aliasMatch.name}: ${aliasMatch.number}`,
          },
          confidence: 1.0,
          reasoning: `Matched configured alias "${q}" -> "${aliasTarget}"`,
        };
      }
    }

    // ── Fast Path 2: Exact Case-Insensitive Match ────────────────────────────
    const exactMatch = contacts.find((c) => c.name.toLowerCase() === qLower);
    if (exactMatch) {
      return {
        found: true,
        status: 'EXACT_MATCH',
        contact: {
          id: exactMatch.id || exactMatch.name,
          name: exactMatch.name,
          number: exactMatch.number,
          label: exactMatch.label || 'mobile',
          formatted: `${exactMatch.name}: ${exactMatch.number}`,
        },
        confidence: 1.0,
        reasoning: `Matched exact contact name "${exactMatch.name}"`,
      };
    }

    // ── Fast Path 3: Direct User's Possessive Match ─────────────────────────
    // e.g. If user is Sushant and contact is "Sushant's Mom" when querying "mom"
    const userPossessivePrefix = `${userName.toLowerCase()}'s`;
    const userPossessiveMatch = contacts.find(
      (c) =>
        c.name.toLowerCase().startsWith(userPossessivePrefix) &&
        c.name.toLowerCase().includes(qLower)
    );
    if (userPossessiveMatch) {
      return {
        found: true,
        status: 'EXACT_MATCH',
        contact: {
          id: userPossessiveMatch.id || userPossessiveMatch.name,
          name: userPossessiveMatch.name,
          number: userPossessiveMatch.number,
          label: userPossessiveMatch.label || 'mobile',
          formatted: `${userPossessiveMatch.name}: ${userPossessiveMatch.number}`,
        },
        confidence: 0.95,
        reasoning: `Matched user possessive contact "${userPossessiveMatch.name}" for user "${userName}"`,
      };
    }

    // ── Fast Path 4: Multi-Word Token Match (e.g. "ritam dutta" in "Ritam Dutta") ───
    const qWords = qLower.split(/[\s,._-]+/).filter((w) => w.length > 0);
    if (qWords.length > 1) {
      const allWordsMatch = contacts.find((c) => {
        const cLower = c.name.toLowerCase();
        return qWords.every((qw) => cLower.includes(qw));
      });
      if (allWordsMatch) {
        return {
          found: true,
          status: 'EXACT_MATCH',
          contact: {
            id: allWordsMatch.id || allWordsMatch.name,
            name: allWordsMatch.name,
            number: allWordsMatch.number,
            label: allWordsMatch.label || 'mobile',
            formatted: `${allWordsMatch.name}: ${allWordsMatch.number}`,
          },
          confidence: 0.96,
          reasoning: `Matched contact containing all query words "${allWordsMatch.name}"`,
        };
      }
    }

    // ── Fast Path 5: Relationship Synonyms (e.g. "mummy" -> "Mom") ──────────
    const MOM_SYNS = ['mummy', 'mom', 'mother', 'maa', 'aai', 'amma', 'mommy', 'mataji'];
    const DAD_SYNS = ['dad', 'father', 'papa', 'daddy', 'baba', 'appa', 'pitaji'];
    let relSyns: string[] | null = null;
    if (MOM_SYNS.includes(qLower)) relSyns = MOM_SYNS;
    else if (DAD_SYNS.includes(qLower)) relSyns = DAD_SYNS;

    if (relSyns) {
      const relMatch = contacts.find((c) => {
        const cLower = c.name.toLowerCase();
        if (/^[a-zA-Z]+'s\s+/i.test(cLower) && !cLower.startsWith(userPossessivePrefix)) {
          return false;
        }
        const cWords = cLower.split(/[\s,._-]+/);
        return relSyns!.some((syn) => cWords.includes(syn) || cLower === syn);
      });

      if (relMatch) {
        return {
          found: true,
          status: 'EXACT_MATCH',
          contact: {
            id: relMatch.id || relMatch.name,
            name: relMatch.name,
            number: relMatch.number,
            label: relMatch.label || 'mobile',
            formatted: `${relMatch.name}: ${relMatch.number}`,
          },
          confidence: 0.98,
          reasoning: `Matched relationship synonym for "${q}" -> "${relMatch.name}"`,
        };
      }
    }

    // ── LLM Privacy-Masked Relational Resolution ────────────────────────────
    // Filter down candidates to a relevant pool to save tokens
    const candidatePool = this.filterCandidatePool(contacts, qLower, userName);
    if (candidatePool.length === 0) {
      return {
        found: false,
        status: 'NO_MATCH',
        confidence: 0,
        disambiguationMessage: `I looked through your contacts but couldn't find anyone matching "${query}".`,
      };
    }

    // Mask phone numbers to ensure zero PII leaves local runtime
    const { maskedContacts, tokenMap } = privacyMasker.maskContacts(candidatePool);

    try {
      const prompt = `You are an intelligent contact & personal relationship resolver for the user: "${userName}".
User query: "${q}"

List of candidate contacts in the user's phonebook:
${JSON.stringify(maskedContacts, null, 2)}

Instructions:
1. Identify if any contact represents the person the user is asking for.
2. CRITICAL RELATIONSHIP RULES:
   - Third-Party Possessives: If a contact is named "[Person]'s Mom/Dad/Sister/etc." (e.g. "Darshan's mom", "Rahul's father"), and [Person] is NOT the user "${userName}", that person belongs to that third party, NOT the user!
   - If the user asks for "mom", and the only match is "Darshan's mom", DO NOT select it as an EXACT_MATCH for the user's mother! Set status to "AMBIGUOUS" and provide a helpful disambiguationMessage asking if they meant Darshan's mom.
   - Common relation synonyms (e.g. Mom = Mother, Maa, Aai, Mummy, Amma; Dad = Father, Papa, Baba, Appa) should be recognized for the user.
3. Output format: Respond strictly with a JSON object:
{
  "status": "EXACT_MATCH" | "AMBIGUOUS" | "NO_MATCH",
  "selectedId": "contact_id_string_or_null",
  "confidence": 0.0 to 1.0,
  "disambiguationMessage": "Clarifying question or null",
  "reasoning": "Brief explanation of decision"
}`;

      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
      });

      const text = response.text?.trim() || '{}';
      const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (!cleanJson) {
        return this.fallbackFuzzyMatch(candidatePool, qLower);
      }

      const parsed = JSON.parse(cleanJson) as {
        status: 'EXACT_MATCH' | 'AMBIGUOUS' | 'NO_MATCH';
        selectedId?: string | null;
        confidence?: number;
        disambiguationMessage?: string;
        reasoning?: string;
      };

      if (parsed.status === 'EXACT_MATCH' && parsed.selectedId) {
        const matched = candidatePool.find((c, i) => (c.id || `contact_${i}`) === parsed.selectedId);
        if (matched) {
          const unmaskedNumber = privacyMasker.unmask(matched.number, tokenMap);
          return {
            found: true,
            status: 'EXACT_MATCH',
            contact: {
              id: matched.id || matched.name,
              name: matched.name,
              number: unmaskedNumber,
              label: matched.label || 'mobile',
              formatted: `${matched.name}: ${unmaskedNumber}`,
            },
            confidence: parsed.confidence || 0.9,
            reasoning: parsed.reasoning,
          };
        }
      }

      if (parsed.status === 'AMBIGUOUS') {
        return {
          found: false,
          status: 'AMBIGUOUS',
          confidence: parsed.confidence || 0.5,
          disambiguationMessage:
            parsed.disambiguationMessage ||
            `I found a contact that might be related, but isn't an exact match. Did you mean someone else?`,
          reasoning: parsed.reasoning,
        };
      }

      return {
        found: false,
        status: 'NO_MATCH',
        confidence: parsed.confidence || 0,
        disambiguationMessage: `I looked through your contacts but couldn't find anyone matching "${query}".`,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      logger.warn('SemanticEntityResolver LLM resolution failed, falling back to safe heuristic', {
        error: String(err),
      });
      return this.fallbackFuzzyMatch(candidatePool, qLower);
    }
  }

  private filterCandidatePool(
    contacts: ContactCandidate[],
    qLower: string,
    userName: string
  ): ContactCandidate[] {
    if (contacts.length <= 25) {
      return contacts;
    }

    const queryWords = qLower.split(/\s+/).filter((w) => w.length > 2);
    const userWords = userName.toLowerCase().split(/\s+/);

    return contacts.filter((c) => {
      const nameLower = c.name.toLowerCase();
      // Keep if contains any query word or user word
      return (
        queryWords.some((w) => nameLower.includes(w)) ||
        userWords.some((w) => nameLower.includes(w)) ||
        nameLower.includes('mom') ||
        nameLower.includes('mummy') ||
        nameLower.includes('maa') ||
        nameLower.includes('aai') ||
        nameLower.includes('dad') ||
        nameLower.includes('papa') ||
        nameLower.includes('baba') ||
        nameLower.includes('mother') ||
        nameLower.includes('father')
      );
    });
  }

  private fallbackFuzzyMatch(
    candidates: ContactCandidate[],
    qLower: string
  ): ResolvedContactResult {
    // Only match if exact word boundary matches and NOT a third-party possessive
    const isThirdPartyPossessive = /^[a-zA-Z]+'s\s+/i.test(qLower);
    const matched = candidates.find((c) => {
      const cName = c.name.toLowerCase();
      if (!isThirdPartyPossessive && /^[a-zA-Z]+'s\s+/i.test(cName)) {
        return false; // Skip third party possessives in fallback
      }
      return cName.includes(qLower);
    });

    if (matched) {
      return {
        found: true,
        status: 'EXACT_MATCH',
        contact: {
          id: matched.id || matched.name,
          name: matched.name,
          number: matched.number,
          label: matched.label || 'mobile',
          formatted: `${matched.name}: ${matched.number}`,
        },
        confidence: 0.75,
        reasoning: 'Fallback word boundary match',
      };
    }

    return {
      found: false,
      status: 'NO_MATCH',
      confidence: 0,
      disambiguationMessage: `Could not find any contact matching "${qLower}".`,
    };
  }
}

export const semanticEntityResolver = new SemanticEntityResolver();
