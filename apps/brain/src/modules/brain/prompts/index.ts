import { MemoryItem } from '@jarvis/shared';
import { BEHAVIOR_PROMPT } from './behavior';
import { IDENTITY_PROMPT } from './identity';
import { buildMemoryPrompt } from './memory';
import { PERSONALITY_PROMPT } from './personality';
import { SAFETY_PROMPT } from './safety';
import { TOOL_RULES_PROMPT } from './tool-rules';

export function buildSystemPrompt(userProfile?: { name?: string; preferredStyle?: string }, memories: MemoryItem[] = []): string {
  const userName = userProfile?.name || 'Sushant';
  const memorySection = buildMemoryPrompt(memories);

  return [
    IDENTITY_PROMPT,
    `User: You are assisting ${userName}.`,
    PERSONALITY_PROMPT,
    BEHAVIOR_PROMPT,
    SAFETY_PROMPT,
    TOOL_RULES_PROMPT,
    memorySection,
  ].join('\n\n');
}

export * from './identity';
export * from './personality';
export * from './behavior';
export * from './safety';
export * from './tool-rules';
export * from './memory';
