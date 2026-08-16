import { MemoryItem } from '@jarvis/shared';

export function buildMemoryPrompt(memories: MemoryItem[]): string {
  if (memories.length === 0) {
    return 'No prior long-term user memories retrieved for this request.';
  }

  const memoryLines = memories.map((m) => `- [${m.type}] ${m.content} (importance: ${m.importance})`).join('\n');
  return `Relevant Long-Term Memories & User Preferences:\n${memoryLines}\n\nUse these memories naturally to personalize your response without explicitly saying "According to my memory database...".`;
}
