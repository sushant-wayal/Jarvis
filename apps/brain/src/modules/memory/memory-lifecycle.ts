import { MemoryType } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';
import { privacyMasker } from '@/modules/brain/privacy-masker';
import { ttlEngine } from '@/modules/brain/ttl-engine';

export interface MemoryCandidate {
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  source?: 'USER_EXPLICIT' | 'EXTRACTED_CONVERSATION' | 'AGENT_OBSERVATION' | 'USER_EXPLICIT_NAME_CHANGE' | string;
  ttlDays?: number;
  expiresAt?: Date;
}

export interface MemoryProcessingResult {
  action: 'INSERTED' | 'UPDATED' | 'RENEWED' | 'REJECTED' | 'DISCARDED';
  memoryId?: string;
  reason: string;
}

export class MemoryLifecycleService {
  /**
   * Evaluates memory candidate against existing knowledge to detect contradictions,
   * protect verified user identity, and maintain semantic integrity with privacy masking.
   */
  async processCandidate(candidate: MemoryCandidate): Promise<MemoryProcessingResult> {
    try {
      const trimmedContent = candidate.content.trim();

      // ── Step 1: Core Identity Protection Guard ────────────────────────────
      const user = await prisma.user.findUnique({ where: { id: candidate.userId } });
      const verifiedUserName = user?.name || 'Sushant';

      const isIdentityViolation = this.checkIdentityViolation(
        trimmedContent,
        verifiedUserName,
        candidate.source
      );

      if (isIdentityViolation) {
        logger.warn('Identity guard rejected contradictory memory candidate', {
          userId: candidate.userId,
          verifiedUserName,
          candidateContent: trimmedContent,
          source: candidate.source,
        });
        return {
          action: 'REJECTED',
          reason: `Violates verified user identity ("${verifiedUserName}")`,
        };
      }

      // Calculate dynamic expiry
      let expiresAt: Date;
      if (candidate.expiresAt) {
        expiresAt = candidate.expiresAt;
      } else if (candidate.ttlDays !== undefined && candidate.ttlDays > 0) {
        expiresAt = ttlEngine.calculateExpiryDate(candidate.ttlDays);
      } else {
        const suggestedDays = await ttlEngine.suggestMemoryTtl(trimmedContent, candidate.type);
        expiresAt = ttlEngine.calculateExpiryDate(suggestedDays);
      }

      // ── Step 2: Fetch existing relevant memories ──────────────────────────
      const existingMemories = await prisma.memory.findMany({
        where: {
          userId: candidate.userId,
          type: candidate.type,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      // Exact content duplicate check
      const exactMatch = existingMemories.find(
        (m) => m.content.toLowerCase().trim() === trimmedContent.toLowerCase()
      );
      if (exactMatch) {
        await prisma.memory.update({
          where: { id: exactMatch.id },
          data: {
            importance: Math.max(exactMatch.importance, candidate.importance),
            confidence: Math.max(exactMatch.confidence, candidate.confidence),
            expiresAt,
            lastReferencedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        logger.info('Renewed TTL for existing duplicate memory', { memoryId: exactMatch.id });
        return {
          action: 'RENEWED',
          memoryId: exactMatch.id,
          reason: 'Identical memory content already exists; renewed TTL',
        };
      }

      if (existingMemories.length === 0) {
        const created = await prisma.memory.create({
          data: {
            userId: candidate.userId,
            type: candidate.type,
            content: trimmedContent,
            importance: candidate.importance,
            confidence: candidate.confidence,
            source: candidate.source || 'EXTRACTED_CONVERSATION',
            expiresAt,
            lastReferencedAt: new Date(),
          },
        });
        return {
          action: 'INSERTED',
          memoryId: created.id,
          reason: 'First memory created in category',
        };
      }

      // ── Step 3: LLM Semantic Memory Arbiter with Privacy Masking ──────────
      const arbiterDecision = await this.evaluateWithLLMArbiter(
        trimmedContent,
        candidate,
        existingMemories,
        verifiedUserName
      );

      if (arbiterDecision.action === 'REJECTED' || arbiterDecision.action === 'DISCARDED') {
        logger.info('Memory arbiter discarded candidate', {
          candidate: trimmedContent,
          reason: arbiterDecision.reason,
        });
        return arbiterDecision;
      }

      if (arbiterDecision.action === 'UPDATED' && arbiterDecision.targetMemoryId) {
        await prisma.memory.update({
          where: { id: arbiterDecision.targetMemoryId },
          data: {
            content: trimmedContent,
            importance: candidate.importance,
            confidence: candidate.confidence,
            source: candidate.source || 'EXTRACTED_CONVERSATION',
            expiresAt,
            lastReferencedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        logger.info('Superseded existing conflicting memory with latest user knowledge', {
          supersededId: arbiterDecision.targetMemoryId,
          newContent: trimmedContent,
        });
        return {
          action: 'UPDATED',
          memoryId: arbiterDecision.targetMemoryId,
          reason: arbiterDecision.reason,
        };
      }

      // Default: insert new memory
      const created = await prisma.memory.create({
        data: {
          userId: candidate.userId,
          type: candidate.type,
          content: trimmedContent,
          importance: candidate.importance,
          confidence: candidate.confidence,
          source: candidate.source || 'EXTRACTED_CONVERSATION',
          expiresAt,
          lastReferencedAt: new Date(),
        },
      });

      return {
        action: 'INSERTED',
        memoryId: created.id,
        reason: 'New independent fact added to long-term memory',
      };
    } catch (err) {
      logger.warn('MemoryLifecycle processing error, defaulting to safe insert', {
        error: String(err),
      });
      return {
        action: 'DISCARDED',
        reason: `Processing error: ${String(err)}`,
      };
    }
  }

  /**
   * Guards against memories claiming a false name or identity that contradicts verified User.name.
   */
  private checkIdentityViolation(
    content: string,
    verifiedName: string,
    source?: string
  ): boolean {
    if (source === 'USER_EXPLICIT_NAME_CHANGE') {
      return false; // Explicit user command allowed to update
    }

    const cLower = content.toLowerCase();
    const vLower = verifiedName.toLowerCase();

    // Regex to detect name assertions like "User's name is X", "User is called X", "My name is X"
    const nameAssertionMatch = cLower.match(
      /(?:user's name is|user name is|user is called|my name is|named)\s+([a-zA-Z]+)/i
    );

    if (nameAssertionMatch) {
      const assertedName = nameAssertionMatch[1].toLowerCase();
      if (assertedName !== vLower && assertedName !== 'chief' && assertedName !== 'sir') {
        return true; // Contradicts verified user name
      }
    }

    return false;
  }

  /**
   * LLM Memory Arbiter with Privacy Masking to evaluate contradictions & redundancy.
   */
  private async evaluateWithLLMArbiter(
    candidateContent: string,
    candidate: MemoryCandidate,
    existingMemories: Array<{ id: string; content: string; source: string | null; importance: number }>,
    verifiedUserName: string
  ): Promise<{ action: 'INSERTED' | 'UPDATED' | 'RENEWED' | 'REJECTED' | 'DISCARDED'; targetMemoryId?: string; reason: string }> {
    // Mask candidate and existing memories
    const { maskedText: maskedCandidate } = privacyMasker.mask(candidateContent);
    const simplifiedExisting = existingMemories.map((m) => {
      const { maskedText } = privacyMasker.mask(m.content);
      return {
        id: m.id,
        content: maskedText,
        source: m.source || 'EXTRACTED_CONVERSATION',
      };
    });

    try {
      const prompt = `You are an intelligent memory arbitration engine for personal assistant Jarvis.
User identity: "${verifiedUserName}"
New candidate memory:
Content: "${maskedCandidate}"
Type: ${candidate.type}
Source Authority: ${candidate.source || 'EXTRACTED_CONVERSATION'} (Authority scale: USER_EXPLICIT = High, EXTRACTED_CONVERSATION = Medium, AGENT_OBSERVATION = Low)

Existing relevant long-term memories in this category:
${JSON.stringify(simplifiedExisting, null, 2)}

Instructions:
1. Compare the new candidate with existing memories.
2. Determine relationship:
   - "DUPLICATE": Same fact or preference already remembered -> action: "RENEW", targetId
   - "CONTRADICTION": Directly contradicts an existing memory (e.g. prefers dark mode vs prefers light mode; hates coffee vs loves coffee).
     * AUTHORITY RULE: A medium/low authority candidate (EXTRACTED_CONVERSATION) CANNOT overwrite an existing memory with High authority (USER_EXPLICIT). If this occurs, action must be "DISCARD".
     * If the candidate has equal or higher authority (e.g. user explicitly updated their preference), action is "UPDATE" and targetId is the superseded memory.
   - "NEW_FACT": New, distinct, non-conflicting fact -> action: "INSERT"

Respond strictly with JSON:
{
  "relationship": "DUPLICATE" | "CONTRADICTION" | "NEW_FACT",
  "action": "INSERT" | "UPDATE" | "RENEW" | "DISCARD",
  "targetMemoryId": "memory_id_or_null",
  "reason": "Brief rationale"
}`;

      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
      });

      const text = response.text?.trim() || '{}';
      const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (!cleanJson) {
        return { action: 'INSERTED', reason: 'Arbiter fallback: clean insert' };
      }

      const parsed = JSON.parse(cleanJson) as {
        relationship: string;
        action: 'INSERT' | 'UPDATE' | 'RENEW' | 'DISCARD';
        targetMemoryId?: string | null;
        reason?: string;
      };

      if (parsed.action === 'DISCARD') {
        return {
          action: 'DISCARDED',
          reason: parsed.reason || 'Candidate discarded due to authority or conflict rule',
        };
      }

      if (parsed.action === 'RENEW' && parsed.targetMemoryId) {
        return {
          action: 'RENEWED',
          targetMemoryId: parsed.targetMemoryId,
          reason: parsed.reason || 'Duplicate memory renewed',
        };
      }

      if (parsed.action === 'UPDATE' && parsed.targetMemoryId) {
        return {
          action: 'UPDATED',
          targetMemoryId: parsed.targetMemoryId,
          reason: parsed.reason || 'Superseded conflicting memory',
        };
      }

      return { action: 'INSERTED', reason: parsed.reason || 'New fact' };
    } catch (err) {
      logger.warn('LLM Memory Arbiter call failed, allowing safe insert', { error: String(err) });
      return { action: 'INSERTED', reason: 'LLM Arbiter unavailable, inserted safely' };
    }
  }

  /**
   * Cleans up expired memories.
   */
  async cleanupExpired(): Promise<number> {
    const res = await prisma.memory.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
    return res.count;
  }
}

export const memoryLifecycleService = new MemoryLifecycleService();
