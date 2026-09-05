/**
 * Semantic Item Matcher
 *
 * Provides privacy-masked LLM semantic matching for productivity entities
 * (Tasks, Reminders, Events, Memories, Places).
 *
 * Prevents:
 * - False matches from partial word overlaps (e.g. "Mumbai" matching mother's birthplace)
 * - Accidental destructive actions on the wrong item
 * - Ambiguity errors when multiple candidates share keywords
 */

import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { privacyMasker } from './privacy-masker';

export interface MatchResult<T> {
  matchedItem: T | null;
  status: 'EXACT_MATCH' | 'AMBIGUOUS' | 'NO_MATCH';
  confidence: number;
  ambiguousCandidates?: T[];
  reasoning?: string;
}

export class SemanticMatcher {
  /**
   * Matches a user query against a list of items using privacy-masked semantic intelligence.
   */
  async matchItem<T>(
    query: string,
    items: T[],
    getText: (item: T) => string,
    getId: (item: T) => string,
    itemTypeName = 'item'
  ): Promise<MatchResult<T>> {
    const q = query.trim();
    if (!q || items.length === 0) {
      return {
        matchedItem: null,
        status: 'NO_MATCH',
        confidence: 0,
        reasoning: 'Empty query or candidate list',
      };
    }

    const qLower = q.toLowerCase();

    // ── Fast Path 1: Exact ID match ──────────────────────────────────────────
    const idMatch = items.find((item) => getId(item) === q);
    if (idMatch) {
      return {
        matchedItem: idMatch,
        status: 'EXACT_MATCH',
        confidence: 1.0,
        reasoning: `Direct ID match for ${getId(idMatch)}`,
      };
    }

    // ── Fast Path 2: Exact Full Title/Content Match ───────────────────────────
    const exactMatch = items.find(
      (item) => getText(item).toLowerCase().trim() === qLower
    );
    if (exactMatch) {
      return {
        matchedItem: exactMatch,
        status: 'EXACT_MATCH',
        confidence: 1.0,
        reasoning: `Exact title match: "${getText(exactMatch)}"`,
      };
    }

    // If only 1 item and text contains query completely, high confidence
    if (items.length === 1 && getText(items[0]).toLowerCase().includes(qLower)) {
      return {
        matchedItem: items[0],
        status: 'EXACT_MATCH',
        confidence: 0.9,
        reasoning: `Sole candidate contains query: "${getText(items[0])}"`,
      };
    }

    // ── LLM Privacy-Masked Semantic Matching ────────────────────────────────
    const { maskedItems } = privacyMasker.maskItems(items, getText, getId);
    const simplifiedCandidates = maskedItems.map((m) => ({
      id: m.id,
      text: m.maskedText,
    }));

    try {
      const prompt = `You are an intelligent entity matcher for personal productivity ${itemTypeName}s.
User search/action query: "${q}"

List of existing ${itemTypeName}s:
${JSON.stringify(simplifiedCandidates, null, 2)}

Instructions:
1. Determine which ${itemTypeName} best corresponds to the user's intent.
2. CRITICAL SAFETY & AMBIGUITY RULES:
   - If the user query is generic or multiple items could plausibly be intended (e.g. query "mom" when items include "Buy gift for mom" and "Call mom"), do NOT randomly pick one! Set status to "AMBIGUOUS" and list the ambiguousIds.
   - If user asks to delete or modify a personal detail (e.g. "forget that I lived in Mumbai"), make sure to match the item describing their own residency, NOT an item describing someone else (e.g. "Mother born in Mumbai").
   - If a confident single match is identified, set status to "EXACT_MATCH" and return selectedId.
   - If no item matches the intent, set status to "NO_MATCH".

Respond strictly with a JSON object:
{
  "status": "EXACT_MATCH" | "AMBIGUOUS" | "NO_MATCH",
  "selectedId": "id_string_or_null",
  "ambiguousIds": ["id1", "id2"],
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
}`;

      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
      });

      const text = response.text?.trim() || '{}';
      const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (!cleanJson) {
        return this.heuristicFallback(qLower, items, getText);
      }

      const parsed = JSON.parse(cleanJson) as {
        status: 'EXACT_MATCH' | 'AMBIGUOUS' | 'NO_MATCH';
        selectedId?: string | null;
        ambiguousIds?: string[];
        confidence?: number;
        reasoning?: string;
      };

      if (parsed.status === 'EXACT_MATCH' && parsed.selectedId) {
        const matched = items.find((item) => getId(item) === parsed.selectedId);
        if (matched) {
          return {
            matchedItem: matched,
            status: 'EXACT_MATCH',
            confidence: parsed.confidence || 0.9,
            reasoning: parsed.reasoning,
          };
        }
      }

      if (parsed.status === 'AMBIGUOUS' && parsed.ambiguousIds?.length) {
        const ambiguous = items.filter((item) =>
          parsed.ambiguousIds?.includes(getId(item))
        );
        return {
          matchedItem: null,
          status: 'AMBIGUOUS',
          confidence: parsed.confidence || 0.5,
          ambiguousCandidates: ambiguous,
          reasoning: parsed.reasoning,
        };
      }

      return {
        matchedItem: null,
        status: 'NO_MATCH',
        confidence: parsed.confidence || 0,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      logger.warn('SemanticMatcher LLM matching failed, using heuristic fallback', {
        error: String(err),
      });
      return this.heuristicFallback(qLower, items, getText);
    }
  }

  private heuristicFallback<T>(
    qLower: string,
    items: T[],
    getText: (item: T) => string
  ): MatchResult<T> {
    // 1. Direct substring match
    const directMatching = items.filter((item) =>
      getText(item).toLowerCase().includes(qLower)
    );

    if (directMatching.length === 1) {
      return {
        matchedItem: directMatching[0],
        status: 'EXACT_MATCH',
        confidence: 0.75,
        reasoning: 'Direct substring match (single candidate)',
      };
    }

    // 2. Token overlap ranking with self-referential weighting
    const queryTokens = qLower.split(/\s+/).filter((w) => w.length > 2);
    const scored = items.map((item) => {
      const textLower = getText(item).toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (textLower.includes(token)) {
          score += 2;
        }
      }
      // Differentiate user's personal detail vs third-party/relative detail
      const isSelfQuery = qLower.includes(' i ') || qLower.includes('my ') || qLower.startsWith('i ');
      const isSelfItem = textLower.includes('user') || textLower.includes(' i ') || textLower.startsWith('i ');
      const isOtherItem = textLower.includes('mother') || textLower.includes('father') || textLower.includes('mom');
      if (isSelfQuery && isSelfItem && !isOtherItem) {
        score += 3;
      }
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const secondBest = scored[1];

    if (best && best.score > 0 && (!secondBest || best.score > secondBest.score)) {
      return {
        matchedItem: best.item,
        status: 'EXACT_MATCH',
        confidence: 0.7,
        reasoning: 'Best token overlap match',
      };
    }

    if (directMatching.length > 1) {
      return {
        matchedItem: null,
        status: 'AMBIGUOUS',
        confidence: 0.5,
        ambiguousCandidates: directMatching,
        reasoning: 'Multiple candidates match query substring',
      };
    }

    return {
      matchedItem: null,
      status: 'NO_MATCH',
      confidence: 0,
      reasoning: 'No candidate matched query',
    };
  }
}

export const semanticMatcher = new SemanticMatcher();
