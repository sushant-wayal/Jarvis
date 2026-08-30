/**
 * Proactive Intelligence Service (Phase 6)
 *
 * Core capabilities:
 *  1. Cross-app message briefing and intelligent synthesis
 *  2. Unanswered question & action item detection
 *  3. Cross-entity resolution (connecting messages to trips/events/tasks)
 *  4. Per-contact communication timeline summary
 */

import { PhoneContext, PhoneNotificationEvent, TaskItem, UserEventItem } from '@jarvis/shared';

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

    // Filter by timePeriod if specified
    const filtered = this.filterByPeriod(notifications, timePeriod);
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
   * Scans messages for explicit questions, urgent requests, or scheduling queries.
   */
  detectActionItems(notifications: PhoneNotificationEvent[]): ActionItemDetection[] {
    const results: ActionItemDetection[] = [];

    for (const notif of notifications) {
      if (!notif.content) continue;
      const text = notif.content.trim();

      if (text.includes('?') || this.isActionRequired(text)) {
        const isUrgent = /urgent|asap|now|emergency|call me|hurry/i.test(text);
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
   * Summarizes all interactions with a specific contact across channels.
   */
  summarizeContact(contactName: string, phoneContext: PhoneContext): string {
    const q = contactName.toLowerCase();
    const matches = (phoneContext.recentNotifications || []).filter((n) =>
      n.sender.toLowerCase().includes(q)
    );

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
      const eventKeywords = [event.title, event.locationName].filter(Boolean) as string[];
      for (const notif of notifications) {
        if (!notif.content) continue;
        const matchesEvent = eventKeywords.some((kw) =>
          notif.content?.toLowerCase().includes(kw.toLowerCase())
        );

        if (matchesEvent) {
          insights.push(
            `Message from ${notif.sender} mentions your upcoming ${event.type.toLowerCase()} "${event.title}": "${notif.content}"`
          );
        }
      }
    }

    for (const task of tasks) {
      for (const notif of notifications) {
        if (!notif.content) continue;
        if (notif.content.toLowerCase().includes(task.title.toLowerCase())) {
          insights.push(
            `Message from ${notif.sender} relates to your task "${task.title}": "${notif.content}"`
          );
        }
      }
    }

    return insights;
  }

  private isActionRequired(text: string): boolean {
    const patterns = [
      /can you/i,
      /could you/i,
      /please send/i,
      /let me know/i,
      /reply/i,
      /reach/i,
      /where are you/i,
      /when are you/i,
      /send me/i,
      /check this/i,
      /call back/i,
    ];
    return patterns.some((p) => p.test(text));
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
