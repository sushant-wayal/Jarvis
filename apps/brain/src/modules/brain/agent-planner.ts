import {
  AgentRunStatus,
  BrainResponse,
  ResponseMode,
  ToolCall,
  ToolContext,
  ToolResult,
} from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { toolRegistry } from '@/modules/tools/registry';
import { AssembledContext } from './context-engine';

export interface PlanAndExecuteOptions {
  message: string;
  context: AssembledContext;
  toolContext: ToolContext;
  maxSteps?: number;
  maxToolCalls?: number;
}

export class AgentPlanner {
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];
  private defaultMaxSteps = 10;
  private defaultMaxToolCalls = 8;

  async planAndExecute(options: PlanAndExecuteOptions): Promise<BrainResponse> {
    const { message, context, toolContext } = options;
    const maxSteps = options.maxSteps || this.defaultMaxSteps;
    const maxToolCalls = options.maxToolCalls || this.defaultMaxToolCalls;

    const startTime = Date.now();
    let stepCount = 0;
    let totalToolCalls = 0;
    const executedToolCalls: ToolCall[] = [];
    const executedToolResults: ToolResult[] = [];
    let finalText = '';
    let responseMode: ResponseMode = 'ANSWER';

    // 1. Create AgentRun record in database for observability
    const agentRun = await prisma.agentRun.create({
      data: {
        userId: toolContext.userId,
        conversationId: toolContext.conversationId,
        status: 'EXECUTING',
        goal: message,
      },
    });

    toolContext.agentRunId = agentRun.id;

    // 2. Build conversation history contents
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }> = [];

    for (const msg of context.recentHistory) {
      if (msg.role === 'USER') {
        if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
        }
      } else if (msg.role === 'ASSISTANT') {
        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
          contents.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations();

    try {
      // 3. Autonomous Multi-Step ReAct Loop
      while (stepCount < maxSteps) {
        stepCount++;
        toolContext.stepNumber = stepCount;

        // Call Gemini with tools and system instruction
        const response = await this.generateWithFallback({
          systemInstruction: `You are Jarvis, a proactive, capable, and natural personal AI operating layer.
${context.systemContextString}

Core Principles:
1. Deliver direct, high-value, and engaging answers to the user's questions immediately.
2. For casual, advisory, weekend, lifestyle, or brainstorming queries (e.g., "what should I do this weekend?", "recommend something fun", "how should I plan my evening?"):
   - Respond with inspiring, structured, and practical recommendations right away.
   - Do NOT stall, output raw tool parameters, or complain about missing location data.
3. Context Awareness: Current time, date, day of week, user name, and known context are already provided in the context above. Do NOT invoke 'date_time', 'current_time', or 'location_get' tools simply to check the day/time for casual chatting.
4. Intelligent Tool Use: Use tools when actions or external lookups are genuinely required (e.g. creating reminders/tasks with 'task_create', creating trips/events with 'event_create', location reminders with 'event_reminder_create', web searching with 'web_search', or saving memories).
5. Full Entity Lifecycle Management (CRITICAL — NEVER claim an action was done without executing the corresponding tool):
   - Tasks & Reminders:
     • Creation: 'task_create'
     • Completion / Paid / Finished: ALWAYS invoke 'task_complete' (or 'task_update' with status: 'COMPLETED'). Pass keywords (e.g. "rent") or ID.
     • Rescheduling / Renaming: 'task_update'
     • Deletion / Cancellation: 'task_delete'
   - Long-Term Memories & Preferences:
     • Storing new preference/fact: 'memory_create'
     • Finding/listing memories: 'memory_search' or 'memory_list'
     • Changing a preference/fact: 'memory_update'
     • Forgetting / Removing a memory: ALWAYS invoke 'memory_delete'
   - Planned Events & Trips:
     • Creating a trip or event: 'event_create'
     • Listing plans: 'event_list'
     • Marking trip completed/cancelled or updating dates/place: 'event_update'
     • Cancelling / Removing a trip: 'event_delete'
   - Location-Based Reminders:
     • Creating location reminder: 'event_reminder_create'
     • Listing location reminders: 'event_reminder_list'
     • Completing or updating location reminder: 'event_reminder_update'
     • Removing location reminder: 'event_reminder_delete'
   - Semantic Places:
     • Saving places (Home, Office, Gym): 'place_save'
     • Listing saved places: 'place_list'
     • Removing a place: 'place_delete'
   - User Profile & Preferences:
     • Updating user name or custom preferences: 'user_profile_update'
     • Viewing profile: 'user_profile_get'
   - Strict Direct Action Rule: Never say "I have updated/completed/deleted/saved it" without having executed the tool in the turn! The change only persists when the tool executes.
6. Seamless Synthesis: When tools provide output, synthesize that information into a polished, natural conversational response. Never display raw JSON or internal parameter keys.

Phone & Contact Intelligence:
- You have the user's synchronized phone contacts in [Phone & Messaging Context] -> [Contacts Loaded].
- YOU (the LLM) are the intelligent contact and relationship resolver. Do not rely on deterministic code:
  1. Single Confident Match: When the user asks to call, video call, or message a person (e.g. "send ritam dutta high on whatsapp", "make a video call to mummy", "call papa"):
     - Use your natural language reasoning to find the target contact in the list. You understand nicknames, family relations (e.g. "mummy" -> Mom/Mother/Maa/Aai, "papa" -> Dad/Father/Baba), and full or partial names (e.g. "ritam dutta" -> Ritam Dutta).
     - For calls: Invoke 'initiate_phone_call' passing contactName, their exact resolved phoneNumber from the list, callType ('voice' | 'video'), and app ('phone' | 'whatsapp').
     - For messages: Invoke 'send_message_to_contact' passing contactName, their exact resolved phoneNumber from the list, message, and preferredApp ('whatsapp' | 'sms').
  2. Ambiguous / Multiple Candidates: If multiple contacts match (e.g. user says "call Rahul" and contacts contain "Rahul Sharma" and "Rahul Verma"):
     - DO NOT execute a call or message arbitrarily!
     - Ask the user directly in your voice response: "I found multiple contacts for Rahul: Rahul Sharma and Rahul Verma. Which one would you like to call?"
  3. No Match Found: If no matching person is in the contact list:
     - DO NOT attempt to call or send a message!
     - Tell the user directly: "I couldn't find anyone named [Name] in your contacts."
- Media Playback (Music & Videos):
  • When user says "play [song/artist/playlist/video]" (e.g. "play Believer on Spotify", "play funny cat videos on YouTube", "play Arijit Singh"):
    Invoke 'play_media' passing query (the song or video name) and app ('spotify' | 'youtube' | 'youtube_music').
    DO NOT call 'open_application' for playback requests — 'open_application' only opens the app home screen, whereas 'play_media' triggers direct playback!
- MANDATORY TOOL INVOCATION RULE: Whenever the user asks to open an app (e.g. "open WhatsApp", "launch YouTube") or call someone/dial a number (e.g. "call 9876543210", "make a video call to John"), you MUST invoke the corresponding tool ('open_application' or 'initiate_phone_call' or 'play_media') in your tool call! NEVER generate text saying "Opening WhatsApp" or "Calling John" or "Playing Believer" without executing the tool, because native launchers and media players ONLY trigger when the tool runs!
- When looking up contacts, invoke 'lookup_contact' first to get the exact number and speak/display the number clearly.
- If notification reading is unavailable (noContext: true in tool output), clearly explain that this feature requires the Jarvis APK build.

Identity & Personal Boundary Rules:
- The verified user is "${toolContext.userName || 'Sushant'}".
- Contacts or entities with possessive prefixes for third parties (e.g. "Darshan's mom", "Priya's dad") belong to that third party, NOT the user!
- If the user asks for a direct relation (e.g. "mom", "dad") and the contact tool returns ambiguous results or a third-party relation (e.g. "Darshan's mom"), do NOT assume that is the user's mom or that the user is Darshan! Ask the user for clarification (e.g. "I found 'Darshan's mom' in your contacts, but not your direct mom contact. Did you mean her, or someone else?").
- NEVER call 'memory_create' to save assumed identity or names from contacts or messages.
- When deleting or modifying items, if the tool indicates ambiguity, ask the user to clarify to prevent accidental data corruption.

Timezone & Scheduling Directive:
- User active timezone is "${toolContext.timezone || 'UTC'}".
- When creating reminders or tasks ('task_create') or events ('event_create'), user times are ALWAYS in their local timezone.
- You MUST pass the 'schedule' argument as an ISO 8601 string including the user's timezone offset (e.g. 'YYYY-MM-DDTHH:mm:ss+05:30') or properly converted to UTC with 'Z'.
- NEVER assume user local time is UTC and NEVER attach 'Z' directly to user local hours (e.g. 9:30 AM local in Asia/Kolkata is NOT 09:30:00Z; it is 09:30:00+05:30 or 04:00:00Z).`,
          contents: contents as never,
          toolsConfig: toolsConfig as never,
        });

        const functionCalls = response.functionCalls;

        // No more tool calls -> Final Assistant Answer
        if (!functionCalls || functionCalls.length === 0) {
          finalText = response.text?.trim() || 'Done.';
          responseMode = executedToolCalls.length > 0 ? 'ACTION' : 'ANSWER';

          await prisma.agentStep.create({
            data: {
              agentRunId: agentRun.id,
              stepNumber: stepCount,
              type: 'RESPONSE',
              status: 'COMPLETED',
              summary: 'Generated final response',
              output: JSON.stringify({ text: finalText }),
            },
          });

          break;
        }

        // 1. Preserve model turn containing functionCall parts and thought_signature
        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent) {
          contents.push(candidateContent as any);
        } else {
          contents.push({
            role: 'model',
            parts: functionCalls.map((fc) => ({
              functionCall: {
                name: fc.name || '',
                args: (fc.args as Record<string, unknown>) || {},
              },
            })),
          });
        }

        // 2. Process Tool Calls and collect functionResponse parts
        const responseParts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> = [];

        for (const fc of functionCalls) {
          const fcName = fc.name || '';
          if (!fcName) continue;

          totalToolCalls++;
          if (totalToolCalls > maxToolCalls) {
            logger.warn('Agent reached max tool calls limit', { totalToolCalls });
            break;
          }

          const toolCall: ToolCall = {
            id: `call_${Math.random().toString(36).substring(2, 9)}`,
            name: fcName,
            input: (fc.args as Record<string, unknown>) || {},
          };
          executedToolCalls.push(toolCall);

          const tool = toolRegistry.getTool(fcName);
          if (!tool) continue;

          // Check if action requires confirmation
          if (tool.requiresConfirmation || tool.riskLevel === 'CRITICAL' || tool.riskLevel === 'HIGH_RISK') {
            await prisma.agentRun.update({
              where: { id: agentRun.id },
              data: { status: 'WAITING_FOR_USER' },
            });

            return {
              text: `I prepared this action: ${tool.name}. Would you like me to proceed?`,
              shouldSpeak: true,
              toolCalls: [toolCall],
              toolResults: [],
              conversationId: toolContext.conversationId,
              requestId: toolContext.requestId,
              mode: 'CONFIRMATION',
              agentRunId: agentRun.id,
              pendingConfirmation: {
                actionId: toolCall.id,
                toolName: tool.name,
                riskLevel: tool.riskLevel,
                summary: `Execute ${tool.name} with ${JSON.stringify(toolCall.input)}`,
                payload: toolCall.input,
              },
            };
          }

          // Record step
          const stepRecord = await prisma.agentStep.create({
            data: {
              agentRunId: agentRun.id,
              stepNumber: stepCount,
              type: 'TOOL_CALL',
              status: 'RUNNING',
              input: JSON.stringify(toolCall.input),
              summary: `Executing tool ${fcName}`,
            },
          });

          // Execute tool
          const toolRes = await tool.execute(toolCall.input, toolContext);
          executedToolResults.push(toolRes);

          await prisma.agentStep.update({
            where: { id: stepRecord.id },
            data: {
              status: toolRes.success ? 'COMPLETED' : 'FAILED',
              output: JSON.stringify(toolRes.output),
              completedAt: new Date(),
            },
          });

          responseParts.push({
            functionResponse: {
              name: fcName,
              response: (toolRes.output as Record<string, unknown>) || { success: toolRes.success },
            },
          });
        }

        if (responseParts.length > 0) {
          contents.push({
            role: 'user',
            parts: responseParts,
          });
        }
      }

      // If loop finished due to step limit, synthesize from executed tool outputs
      if (!finalText) {
        if (executedToolResults.length > 0) {
          const lastTool = executedToolCalls[executedToolCalls.length - 1];
          const lastRes = executedToolResults[executedToolResults.length - 1];
          finalText = this.formatDirectOutput(lastTool?.name || '', lastRes?.output);
        } else {
          finalText = 'I reached the step limit before completing this task. Please try a simpler request.';
        }
      }

      // Update AgentRun to COMPLETED
      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error('AgentPlanner error during execution', err, { agentRunId: agentRun.id });
      finalText = this.getFallbackAnswer(message, executedToolCalls, executedToolResults, err);

      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
    }

    const PHONE_ACTION_TYPES = new Set([
      'CALL_CONTACT', 'SEND_SMS', 'REPLY_TO_NOTIFICATION', 'OPEN_APP', 'OPEN_CONVERSATION', 'PLAY_MEDIA',
    ]);

    let pendingPhoneAction: import('@jarvis/shared').JarvisPhoneAction | undefined;
    let scheduledReminder: import('@jarvis/shared').ScheduledReminder | undefined;

    for (const toolResult of executedToolResults) {
      const output = toolResult.output as Record<string, unknown> | null;
      if (output) {
        const actionType = (output.type as string) || (output.action as string);
        if (typeof actionType === 'string' && PHONE_ACTION_TYPES.has(actionType)) {
          pendingPhoneAction = {
            ...output,
            type: actionType,
            action: actionType,
          } as unknown as import('@jarvis/shared').JarvisPhoneAction;
        }
      }
      if (toolResult.toolName === 'task_create' && toolResult.success && output) {
        if (output.taskId && output.title && output.scheduledFor) {
          scheduledReminder = {
            taskId: String(output.taskId),
            title: String(output.title),
            scheduledFor: String(output.scheduledFor),
          };
        }
      }
    }

    // Robustness Guard: If the user explicitly requested to open an app, make a call, or play media,
    // but the LLM directly replied with text instead of executing the tool,
    // synthesize the pending phone action so the user's phone still executes the action!
    if (!pendingPhoneAction) {
      const lowerMsg = message.toLowerCase().trim();
      const openMatch = lowerMsg.match(/^(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:open|launch|start)\s+([a-zA-Z0-9_\s]+)$/i);
      const playMatch = lowerMsg.match(/^(?:please\s+|can\s+you\s+|could\s+you\s+)?play\s+(.+?)(?:\s+(?:on|via|in)\s+(spotify|youtube(?:\s+music)?))?$/i);

      if (playMatch && playMatch[1]) {
        const rawQuery = playMatch[1].trim();
        const rawApp = (playMatch[2] || (lowerMsg.includes('spotify') ? 'spotify' : (lowerMsg.includes('youtube') ? 'youtube' : 'spotify'))).toLowerCase();
        const app = rawApp.includes('youtube') ? (rawApp.includes('music') ? 'youtube_music' : 'youtube') : 'spotify';
        pendingPhoneAction = {
          type: 'PLAY_MEDIA',
          action: 'PLAY_MEDIA',
          query: rawQuery,
          app,
          response: `Playing "${rawQuery}" on ${app === 'spotify' ? 'Spotify' : 'YouTube'}.`,
        } as unknown as import('@jarvis/shared').JarvisPhoneAction;
        logger.info('Synthesized pending PLAY_MEDIA action from user message intent', { query: rawQuery, app });
      } else if (openMatch && openMatch[1]) {
        const candidateApp = openMatch[1].replace(/\b(?:the\s+)?app\b/gi, '').trim();
        if (candidateApp && candidateApp.length >= 2) {
          pendingPhoneAction = {
            type: 'OPEN_APP',
            action: 'OPEN_APP',
            app: candidateApp.toLowerCase(),
            response: `Opening ${candidateApp}.`,
          } as unknown as import('@jarvis/shared').JarvisPhoneAction;
          logger.info('Synthesized pending OPEN_APP action from user message intent', { app: candidateApp });
        }
      }
    }

    return {
      text: finalText,
      conversationId: toolContext.conversationId,
      toolCalls: executedToolCalls,
      toolResults: executedToolResults,
      shouldSpeak: true,
      requestId: toolContext.requestId,
      mode: responseMode,
      agentRunId: agentRun.id,
      pendingPhoneAction,
      scheduledReminder,
    };
  }

  private formatDirectOutput(toolName: string, rawOutput: unknown): string {
    if (!rawOutput || typeof rawOutput !== 'object') {
      return String(rawOutput || 'Done.');
    }
    const output = rawOutput as Record<string, unknown>;
    if (toolName === 'calculator') {
      return `${output.result}.`;
    }
    if (toolName === 'current_time' || toolName === 'date_time') {
      if (typeof output.formatted === 'string') return output.formatted;
      if (typeof output.time === 'string') return `It is ${output.time}.`;
    }
    if (toolName === 'task_create') {
      return `Done. I've scheduled "${output.title}".`;
    }
    if (toolName === 'memory_create') {
      return `I will remember that.`;
    }
    if (toolName === 'event_create') {
      return `Got it. I'll keep your ${output.title || 'trip'} in mind.`;
    }
    if (toolName === 'event_reminder_create') {
      return `Got it. I'll remind you when you're in ${output.targetLocation || 'that area'}.`;
    }
    if (toolName === 'place_save') {
      return `Saved "${output.name}" as a known place.`;
    }
    if (toolName === 'location_get') {
      const locStr = [output.city, output.state, output.country].filter(Boolean).join(', ');
      return locStr ? `You are currently in ${locStr}.` : 'Location currently unavailable.';
    }
    if (toolName === 'open_application') {
      if (typeof output.response === 'string') return output.response;
      return `Opening ${output.app || 'application'}.`;
    }
    if (
      toolName === 'generate_message_briefing' ||
      toolName === 'read_phone_messages' ||
      toolName === 'search_phone_messages' ||
      toolName === 'detect_unanswered_messages' ||
      toolName === 'get_contact_interaction_summary' ||
      toolName === 'lookup_contact'
    ) {
      if (typeof output.summary === 'string') return output.summary;
      if (typeof output.response === 'string') return output.response;
    }
    if (typeof output.message === 'string') {
      return output.message;
    }
    if (toolName === 'task_list') {
      if (Array.isArray(output.tasks)) {
        return output.tasks.length === 0
          ? 'You have no active tasks or reminders.'
          : `You have ${output.tasks.length} active task${output.tasks.length === 1 ? '' : 's'}: ${output.tasks.map((t: any) => t.title).join(', ')}.`;
      }
    }
    if ('result' in output) {
      return `${output.result}`;
    }
    return JSON.stringify(output);
  }

  private getFallbackAnswer(
    message: string,
    toolCalls: ToolCall[],
    toolResults: ToolResult[],
    err?: unknown
  ): string {
    if (toolResults.length > 0) {
      const lastTool = toolCalls[toolCalls.length - 1];
      const lastRes = toolResults[toolResults.length - 1];
      if (lastRes.output) {
        return this.formatDirectOutput(lastTool?.name || '', lastRes.output);
      }
    }

    const mathMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:into|times|multiplied by|\*|x|\+|\-|\/|divided by)\s*(\d+(?:\.\d+)?)/i);
    if (mathMatch) {
      const num1 = parseFloat(mathMatch[1]);
      const num2 = parseFloat(mathMatch[2]);
      const msg = message.toLowerCase();
      if (msg.includes('into') || msg.includes('times') || msg.includes('multiplied') || msg.includes('*') || msg.includes('x')) {
        return `${num1 * num2}.`;
      }
      if (msg.includes('+') || msg.includes('plus')) return `${num1 + num2}.`;
      if (msg.includes('-') || msg.includes('minus')) return `${num1 - num2}.`;
      if (msg.includes('/') || msg.includes('divided')) return `${num2 !== 0 ? num1 / num2 : 'Error'}.`;
    }

    const errDetail = err instanceof Error ? err.message : '';
    if (errDetail) {
      return `I encountered an issue processing that: ${errDetail}. Please try again.`;
    }

    return 'I was unable to process that request. Please try again.';
  }

  private async generateWithFallback(params: {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }>;
    toolsConfig?: Array<Record<string, unknown>>;
  }) {
    const uniqueModels = Array.from(new Set(this.fallbackModels));
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const config: Record<string, unknown> = {};
        if (params.systemInstruction) {
          config.systemInstruction = params.systemInstruction;
        }
        if (params.toolsConfig && params.toolsConfig.length > 0) {
          config.tools = [{ functionDeclarations: params.toolsConfig }];
        }

        const response = await aiClient.models.generateContent({
          model,
          contents: params.contents as never,
          config: Object.keys(config).length > 0 ? (config as never) : undefined,
        });
        return response;
      } catch (err) {
        lastError = err;
        logger.warn(`Model ${model} failed in planner, trying next fallback model`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw lastError || new Error('All fallback models failed in agent planner');
  }
}

export const agentPlanner = new AgentPlanner();
