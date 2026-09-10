/**
 * Proactive Intelligence Service
 *
 * Core capabilities:
 *  1. Cross-app message briefing and intelligent synthesis
 *  2. Semantic unanswered question & action item detection (LLM-driven)
 *  3. Cross-entity resolution (connecting messages to trips/events/tasks)
 *  4. Per-contact communication timeline summary
 */

import { PhoneContext, PhoneNotificationEvent, TaskItem, UserEventItem } from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface ActionItemDetection {
  sender: string;
  app: string;
  questionOrRequest: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: string;
}

export interface ProactiveBriefingResult {
  summaryText: string;
  totalMessages: number;
  unansweredCount: number;
  actionItems: ActionItemDetection[];
  highlights: string[];
}

export class ProactiveIntelligenceService {
  /**
   * Generates a high-value, natural voice briefing of messages across all apps.
   */
  generateBriefing(phoneContext: PhoneContext, timePeriod?: string): ProactiveBriefingResult {
    const notifications = phoneContext.recentNotifications;
    if (!notifications || notifications.length === 0) {
      return {
        summaryText: 'You have no recent messages across your connected apps.',
        totalMessages: 0,
        unansweredCount: 0,
        actionItems: [],
        highlights: [],
      };
    }

    const filtered = this.filterByPeriod(notifications, timePeriod);
    if (filtered.length === 0) {
      if (notifications.length > 0 && timePeriod) {
        const fallbackBriefing = this.generateBriefing(phoneContext, undefined);
        return {
          ...fallbackBriefing,
          summaryText: `No new messages specifically from ${timePeriod}, but overall: ${fallbackBriefing.summaryText}`,
        };
      }
      return {
        summaryText: 'You have no recent messages across your connected apps.',
        totalMessages: 0,
        unansweredCount: 0,
        actionItems: [],
        highlights: [],
      };
    }

    const actionItems = this.detectActionItems(filtered);

    // Group by sender
    const bySender = new Map<string, PhoneNotificationEvent[]>();
    for (const notif of filtered) {
      const existing = bySender.get(notif.sender) || [];
      existing.push(notif);
      bySender.set(notif.sender, existing);
    }

    const highlights: string[] = [];
    const senderSummaries: string[] = [];

    for (const [sender, messages] of bySender.entries()) {
      const apps = Array.from(new Set(messages.map((m) => m.app))).join(' and ');
      const latest = messages[0];
      const hasQuestion = messages.some((m) => m.content && (m.content.includes('?') || this.isActionRequired(m.content)));

      if (hasQuestion && latest.content) {
        highlights.push(`${sender} on ${apps}: "${latest.content}"`);
      }

      senderSummaries.push(
        `${sender} (${messages.length} message${messages.length > 1 ? 's' : ''} on ${apps})`
      );
    }

    let summaryText = `You have ${filtered.length} recent message${filtered.length > 1 ? 's' : ''} from ${bySender.size} contact${bySender.size > 1 ? 's' : ''}: ${senderSummaries.join(', ')}.`;

    if (actionItems.length > 0) {
      summaryText += ` Note: ${actionItems.map((a) => `${a.sender} asked "${a.questionOrRequest}"`).join('; ')}.`;
    }

    return {
      summaryText,
      totalMessages: filtered.length,
      unansweredCount: actionItems.length,
      actionItems,
      highlights,
    };
  }

  /**
   * Generates an intelligent, conversational briefing using the LLM.
   */
  async generateBriefingLLM(phoneContext: PhoneContext, timePeriod?: string): Promise<ProactiveBriefingResult> {
    const baseBriefing = this.generateBriefing(phoneContext, timePeriod);
    const notifications = phoneContext.recentNotifications || [];
    if (notifications.length === 0) return baseBriefing;

    try {
      const prompt = `You are Jarvis, delivering a concise, proactive voice briefing of incoming notifications for the user.
Notifications:
${JSON.stringify(notifications.slice(0, 15).map((n) => ({ sender: n.sender, app: n.app, text: n.content })), null, 2)}

Provide a natural, conversational 2-3 sentence audio briefing highlighting who reached out, urgent questions, and anything needing a reply.`;

      const res = await aiClient.models.generateContent({
        model: FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest',
        contents: prompt,
      });

      const text = res.text?.trim();
      if (text) {
        return {
          ...baseBriefing,
          summaryText: text,
        };
      }
    } catch (err) {
      logger.warn('LLM briefing generation error, falling back to base', { err: String(err) });
    }

    return baseBriefing;
  }

  /**
   * Scans messages for questions, requests, or scheduling queries.
   */
  detectActionItems(notifications: PhoneNotificationEvent[]): ActionItemDetection[] {
    const results: ActionItemDetection[] = [];

    for (const notif of notifications) {
      if (!notif.content) continue;
      const text = notif.content.trim();

      if (text.includes('?') || this.isActionRequired(text)) {
        const lower = text.toLowerCase();
        const isUrgent =
          lower.includes('urgent') ||
          lower.includes('asap') ||
          lower.includes('emergency') ||
          lower.includes('hurry') ||
          lower.includes('immediately');

        results.push({
          sender: notif.sender,
          app: notif.app,
          questionOrRequest: text,
          urgency: isUrgent ? 'HIGH' : text.includes('?') ? 'MEDIUM' : 'LOW',
          timestamp: notif.timestamp,
        });
      }
    }

    return results;
  }

  /**
   * LLM-driven semantic action item detector that understands nuance, urgency, and multilingual phrasing.
   */
  async detectActionItemsLLM(notifications: PhoneNotificationEvent[]): Promise<ActionItemDetection[]> {
    if (!notifications || notifications.length === 0) return [];

    try {
      const prompt = `You are an AI assistant analyzing notification messages for the user.
Identify any messages that ask a question, request an action, or demand urgent attention (in any language e.g. English, Hindi, Hinglish).

Notifications:
${JSON.stringify(notifications.slice(0, 15).map((n, i) => ({ id: i, sender: n.sender, app: n.app, content: n.content, timestamp: n.timestamp })), null, 2)}

Respond strictly in JSON array format:
[
  {
    "sender": "string",
    "app": "string",
    "questionOrRequest": "extracted question or request",
    "urgency": "HIGH" | "MEDIUM" | "LOW",
    "timestamp": "string"
  }
]
If none, return []`;

      const res = await aiClient.models.generateContent({
        model: FAST_FALLBACK_MODELS[0] || 'gemini-flash-lite-latest',
        contents: prompt,
      });

      const text = res.text?.trim() || '[]';
      const cleanJson = text.substring(text.indexOf('['), text.lastIndexOf(']') + 1);
      if (cleanJson) {
        const parsed = JSON.parse(cleanJson) as ActionItemDetection[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      logger.warn('LLM detectActionItems error, using fallback', { err: String(err) });
    }

    return this.detectActionItems(notifications);
  }

  /**
   * Summarizes all interactions with a specific contact across channels.
   */
  summarizeContact(contactName: string, phoneContext: PhoneContext): string {
    const q = contactName.toLowerCase().trim();
    const matches = (phoneContext.recentNotifications || []).filter((n) => {
      const s = n.sender.toLowerCase();
      return s === q || s.includes(q);
    });

    if (matches.length === 0) {
      return `No recent messaging activity found for ${contactName}.`;
    }

    const apps = Array.from(new Set(matches.map((m) => m.app))).join(', ');
    const latest = matches[0];
    const timeStr = new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let summary = `You have ${matches.length} message${matches.length > 1 ? 's' : ''} from ${matches[0].sender} on ${apps}. Latest at ${timeStr}: "${latest.content || '[content hidden]'}"`;

    if (matches.length > 1) {
      const historyItems = matches.slice(1, 4).map((m) => `"${m.content}"`).join(', ');
      summary += ` Earlier: ${historyItems}.`;
    }

    return summary;
  }

  /**
   * Cross-references phone messages with user events & tasks for proactive contextual awareness.
   */
  correlateWithPlans(
    phoneContext: PhoneContext,
    events: UserEventItem[],
    tasks: TaskItem[]
  ): string[] {
    const insights: string[] = [];
    const notifications = phoneContext.recentNotifications || [];

    for (const event of events) {
      const eventKeywords = [event.title, event.locationName]
        .filter(Boolean)
        .map((k) => (k as string).toLowerCase().trim())
        .filter((k) => k.length >= 3);

      for (const notif of notifications) {
        if (!notif.content) continue;
        const cLower = notif.content.toLowerCase();
        const matchesEvent = eventKeywords.some((kw) => cLower.includes(kw));

        if (matchesEvent) {
          insights.push(
            `Message from ${notif.sender} mentions your upcoming ${event.type.toLowerCase()} "${event.title}": "${notif.content}"`
          );
        }
      }
    }

    for (const task of tasks) {
      const titleLower = task.title.toLowerCase().trim();
      if (titleLower.length < 3) continue;

      for (const notif of notifications) {
        if (!notif.content) continue;
        if (notif.content.toLowerCase().includes(titleLower)) {
          insights.push(
            `Message from ${notif.sender} relates to your task "${task.title}": "${notif.content}"`
          );
        }
      }
    }

    return insights;
  }

  private isActionRequired(text: string): boolean {
    const lower = text.toLowerCase();
    const actionTokens = [
      'can you',
      'could you',
      'please',
      'send',
      'let me know',
      'reply',
      'reach',
      'where are you',
      'when are you',
      'check this',
      'call back',
    ];
    return actionTokens.some((t) => lower.includes(t));
  }

  private filterByPeriod(notifications: PhoneNotificationEvent[], period?: string): PhoneNotificationEvent[] {
    if (!period) return notifications;
    const now = Date.now();
    let cutoff = now - 24 * 3600000;

    switch (period.toLowerCase()) {
      case 'today':
      case 'this_morning':
        cutoff = new Date().setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        cutoff = new Date().setHours(0, 0, 0, 0) - 86400000;
        break;
      case 'recently':
        cutoff = now - 3 * 3600000;
        break;
      case 'this_week':
        cutoff = now - 7 * 86400000;
        break;
    }

    return notifications.filter((n) => new Date(n.timestamp).getTime() >= cutoff);
  }
}

export const proactiveIntelligenceService = new ProactiveIntelligenceService();
