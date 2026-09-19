import {
  AgentRunStatus,
  BrainResponse,
  IntentType,
  IntermediateStatusUpdate,
  ResponseMode,
  ToolCall,
  ToolContext,
  ToolResult,
} from '@jarvis/shared';
import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { toolRegistry } from '@/modules/tools/registry';
import { ttsProvider } from '@/modules/voice/tts-provider';
import { AssembledContext } from './context-engine';
import { spokenStatusFormatter, StatusSpeechThrottler } from './spoken-status-formatter';

export interface ToolBudgetConfig {
  maxToolCalls: number;
  maxSteps: number;
}

/**
 * Dynamically resolves tool execution budget and step limits based on
 * classified intent and task complexity.
 */
export function resolveToolBudget(intent?: IntentType, message?: string): ToolBudgetConfig {
  const lower = (message || '').toLowerCase();
  const isDeepAnalytical =
    lower.includes('architect') ||
    lower.includes('deep dive') ||
    lower.includes('investigat') ||
    lower.includes('compar') ||
    lower.includes('codebase') ||
    lower.includes('repositor') ||
    lower.includes('analyze') ||
    lower.includes('analysis') ||
    lower.includes('workflow') ||
    lower.includes('integrate') ||
    lower.includes('integration') ||
    lower.includes('audit');

  if (isDeepAnalytical || intent === 'PLANNING') {
    return { maxToolCalls: 18, maxSteps: 12 };
  }

  switch (intent) {
    case 'CALCULATION':
    case 'ACTION':
    case 'LOCATION_QUERY':
    case 'CONVERSATION':
      return { maxToolCalls: 4, maxSteps: 5 };

    case 'TASK_CREATION':
    case 'TASK_QUERY':
    case 'REMINDER':
    case 'EVENT_CREATION':
    case 'INFORMATION_LOOKUP':
      return { maxToolCalls: 6, maxSteps: 6 };

    case 'SEARCH':
    case 'QUESTION':
    case 'MEMORY_QUERY':
    case 'MEMORY_UPDATE':
      return { maxToolCalls: 10, maxSteps: 8 };

    default:
      return { maxToolCalls: 8, maxSteps: 8 };
  }
}

export interface PlanAndExecuteOptions {
  message: string;
  context: AssembledContext;
  toolContext: ToolContext;
  intent?: IntentType;
  maxSteps?: number;
  maxToolCalls?: number;
  speakResponse?: boolean;
  speakIntermediateStatus?: boolean;
  onProgress?: (update: IntermediateStatusUpdate) => Promise<void> | void;
}

export class AgentPlanner {
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];
  private defaultMaxSteps = 10;
  private defaultMaxToolCalls = 8;

  async planAndExecute(options: PlanAndExecuteOptions): Promise<BrainResponse> {
    const { message, context, toolContext } = options;
    const dynamicBudget = resolveToolBudget(options.intent, options.message);
    const maxSteps = options.maxSteps || dynamicBudget.maxSteps;
    const maxToolCalls = options.maxToolCalls || dynamicBudget.maxToolCalls;

    const startTime = Date.now();
    let stepCount = 0;
    let totalToolCalls = 0;
    const executedToolCalls: ToolCall[] = [];
    const executedToolResults: ToolResult[] = [];
    let finalText = '';
    let responseMode: ResponseMode = 'ANSWER';
    const speechThrottler = new StatusSpeechThrottler(2, 3000);

    // 1. Create or reuse AgentRun record in database for observability
    let agentRun = toolContext.agentRunId
      ? await prisma.agentRun.findUnique({ where: { id: toolContext.agentRunId } })
      : null;

    if (!agentRun) {
      agentRun = await prisma.agentRun.create({
        data: {
          userId: toolContext.userId,
          conversationId: toolContext.conversationId,
          status: 'EXECUTING',
          goal: message,
        },
      });
      toolContext.agentRunId = agentRun.id;
    }

    // 2. Build conversation history contents
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }> = [];

    for (const msg of context.recentHistory) {
      const text = msg.content?.trim();
      if (!text) continue;

      if (msg.role === 'USER') {
        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
          // Merge consecutive user messages
          const prev = contents[contents.length - 1].parts[0]?.text || '';
          contents[contents.length - 1].parts[0] = { text: `${prev}\n${text}` };
        } else {
          contents.push({ role: 'user', parts: [{ text }] });
        }
      } else if (msg.role === 'ASSISTANT') {
        if (contents.length === 0) {
          // Gemini chat contents must start with a user turn
          contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
          contents.push({ role: 'model', parts: [{ text }] });
        } else if (contents[contents.length - 1].role === 'model') {
          // Merge consecutive model messages
          const prev = contents[contents.length - 1].parts[0]?.text || '';
          contents[contents.length - 1].parts[0] = { text: `${prev}\n${text}` };
        } else {
          contents.push({ role: 'model', parts: [{ text }] });
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    // Check if there is an active pending confirmation for this conversation
    const lastAssistantMessage = context.recentHistory
      .slice()
      .reverse()
      .find((m) => m.role === 'ASSISTANT');
    let activePendingConfirmation = (lastAssistantMessage?.metadata as Record<string, unknown> | undefined)
      ?.pendingConfirmation as
      | { actionId: string; toolName: string; riskLevel: string; summary: string; payload: Record<string, unknown> }
      | undefined;

    if (!activePendingConfirmation && toolContext.conversationId) {
      const pendingStep = await prisma.agentStep.findFirst({
        where: {
          type: 'CONFIRMATION',
          status: 'PENDING',
          agentRun: { conversationId: toolContext.conversationId },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (pendingStep?.input) {
        try {
          activePendingConfirmation = JSON.parse(pendingStep.input);
        } catch {
          // ignore
        }
      }
    }

    const confirmationDirective = activePendingConfirmation
      ? `
[ACTIVE CONFIRMATION REQUEST AWAITING USER DECISION]:
- Prepared Action / Tool: "${activePendingConfirmation.toolName}"
- Prepared Parameters: ${JSON.stringify(activePendingConfirmation.payload)}
- Summary: "${activePendingConfirmation.summary}"

CRITICAL INSTRUCTIONS FOR THIS TURN:
1. USER APPROVAL / CONFIRMATION:
   If the user's latest input expresses consent, agreement, confirmation, or instruction to proceed (such as "yes", "yeah", "yep", "confirm", "proceed", "go ahead", "do it", "sure", "merge it", "okay", "haan krdo"):
   - You MUST IMMEDIATELY invoke the tool '${activePendingConfirmation.toolName}' passing the exact prepared parameters!
   - DO NOT ask for confirmation again. Explicit user authorization has been received in this turn!
2. USER CANCELLATION / REJECTION:
   If the user's latest input expresses refusal, cancellation, or rejection (such as "no", "cancel", "stop", "don't do that", "never mind", "rehn de"):
   - DO NOT invoke the tool!
   - Respond naturally acknowledging the cancellation (e.g., "Action cancelled. I won't execute that.").
3. USER TOPIC CHANGE:
   If the user asks an unrelated question or changes the topic, answer their new question and leave the pending action unexecuted.
`
      : '';

    // Check user integration 3-way permissions policy (ALLOW | ASK | DENY)
    const userPrefs = context.userProfile?.preferences as Record<string, any> | undefined;
    const integrationsConfig = userPrefs?.integrations as Record<string, any> | undefined;
    let integrationPermissionsDirective = '';
    if (integrationsConfig) {
      const allowLines: string[] = [];
      const denyLines: string[] = [];

      for (const [intId, config] of Object.entries(integrationsConfig)) {
        const policies = (config as any)?.policies;
        const autoApprove = (config as any)?.autoApprove;

        if (policies && typeof policies === 'object') {
          for (const [action, policy] of Object.entries(policies)) {
            if (policy === 'ALLOW') allowLines.push(`- ${intId} [${action}]: Pre-authorized (Execute directly).`);
            if (policy === 'DENY') denyLines.push(`- ${intId} [${action}]: Disallowed / Blocked by user.`);
          }
        } else if (autoApprove && typeof autoApprove === 'object') {
          for (const [action, allowed] of Object.entries(autoApprove)) {
            if (allowed === true) allowLines.push(`- ${intId} [${action}]: Pre-authorized (Execute directly).`);
          }
        }
      }

      const sections: string[] = [];
      if (allowLines.length > 0) {
        sections.push(`[PRE-AUTHORIZED ACTIONS - DIRECT EXECUTION]:\n${allowLines.join('\n')}\nFor these actions, invoke tools directly without asking for confirmation.`);
      }
      if (denyLines.length > 0) {
        sections.push(`[DISALLOWED ACTIONS - BLOCKED BY USER]:\n${denyLines.join('\n')}\nDo NOT attempt to invoke tools for disallowed actions. Inform the user they can enable them in Settings > Integrations.`);
      }
      if (sections.length > 0) {
        integrationPermissionsDirective = `\n${sections.join('\n\n')}\n`;
      }
    }

    const systemInstruction = `You are Jarvis, a proactive, capable, and natural personal AI operating layer.
${context.systemContextString}
${confirmationDirective}
${integrationPermissionsDirective}

Core Principles:
1. Deliver direct, high-value, and engaging answers to the user's questions immediately.
2. For casual, advisory, weekend, lifestyle, or brainstorming queries (e.g., "what should I do this weekend?", "recommend something fun", "how should I plan my evening?"):
   - Respond with inspiring, structured, and practical recommendations right away.
   - Do NOT stall, output raw tool parameters, or complain about missing location data.
3. Context Awareness & Multi-Turn Dialogue Continuity:
   - Current time, date, day of week, user name, and known context are already provided in the context above. Do NOT invoke 'date_time', 'current_time', or 'location_get' tools simply to check the day/time for casual chatting.
   - Continuous Dialogue Memory: You maintain persistent multi-turn conversations. When the user asks follow-up questions, refers to pronouns ("it", "that", "these", "those"), or references earlier recommendations (e.g. "for all the travel options, check availability", "remove the reminder", "which one is fastest?"), ALWAYS resolve them directly against the prior turns in this conversation. Never lose track of what was just discussed or treat a follow-up query as an isolated new topic.
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
7. Quality & Articulation Standards (CRITICAL):
   - NEVER reply with a bare confirmation like "Done.", "Done", "Finished.", "OK.", or "Action completed." when the user has asked for a system architecture, design overview, technical explanation, code review, plan, or recommendations!
   - When tools provide data or after analyzing code/repositories, synthesize a thorough, professional, and well-structured response with clear component breakdowns, architectural considerations, and implementation guidance.
   - For complex software engineering or integration tasks, explain the components, data flow, security/auth considerations, API contracts, and recommended implementation steps.

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
  • When user asks to play, stream, or listen to any music, song, artist, album, playlist, or video in ANY natural language phrasing (e.g. "on spotify play tum mere ho by anuv jain", "play believer on spotify", "spotify pe anuv jain chalao", "play funny cat videos on youtube", "put on viva la vida", "can you play coldplay"):
    - ZERO PROMPTING RULE: NEVER ask the user to choose between Spotify and YouTube! NEVER ask "Which app would you like to use?" or offer options.
    - Semantic Phrasing Understanding: Users express requests in many ways regardless of word order or language ("on spotify play X", "play X on spotify", "spotify pe X bajao", "put on X"). You (the LLM) must understand the user's intent naturally.
    - Platform Resolution:
      * If the user mentions Spotify anywhere in the request, set app: 'spotify'.
      * If the user mentions YouTube anywhere in the request, set app: 'youtube'.
      * If no platform is mentioned, default to app: 'spotify' for songs/music, and app: 'youtube' for videos.
    - Clean Media Query Extraction: In 'query', extract ONLY the pure song, artist, album, playlist, or video title to search. Extract the pure media name, stripping any platform words ("Spotify", "YouTube"), commanding verbs ("play", "put on", "stream", "chalao", "bajao", "lagao"), and prepositions ("on", "in", "via", "pe").
      * "on spotify play tum mere ho by anuv jain" -> query: "tum mere ho by anuv jain", app: "spotify"
      * "play tum mere ho on spotify" -> query: "tum mere ho", app: "spotify"
      * "spotify pe anuv jain ka gaana bajao" -> query: "anuv jain", app: "spotify"
      * "play believer" -> query: "believer", app: "spotify"
      * "show cat compilation on youtube" -> query: "cat compilation", app: "youtube"
    - Mandatory Tool Execution: IMMEDIATELY invoke the 'play_media' tool! NEVER generate text saying "Playing [song]" without invoking the tool, because playback on the mobile device ONLY triggers when 'play_media' runs.
    - Intelligent Autoplay & Intent Extraction:
      * When user specifies an activity, mood, energy, or ambient vibe (e.g. "play some music so i am playing chess", "play music while i study", "play workout music", "play something to help me sleep", "play chill songs"):
        - NEVER pass a single generic noun or verb like "chess", "focus", "study", "work", "gym", "sleep" as the 'query'! A single noun like "focus" or "chess" will mistakenly match loud rap or pop tracks with that word in their title!
        - Instead, formulate a musically descriptive soundscape phrase in 'query' that matches the activity's acoustic needs:
          • Chess / Study / Concentration / Coding: query: "deep focus instrumental" (or "lofi study beats"), mood: "focus", activity: "chess", energy: "low", genre: "instrumental"
          • Workout / Gym / Running: query: "high energy workout hits", mood: "energetic", activity: "workout", energy: "high"
          • Sleep / Bedtime / Relaxation: query: "peaceful ambient sleep", mood: "relaxed", activity: "sleep", energy: "low", genre: "ambient"
          • Chill / Relaxing: query: "chill acoustic vibes" (or "lofi chill beats"), mood: "chill", energy: "low", genre: "acoustic"
          • Generic "play some music" / "play songs": query: "global trending hits", explorationLevel: "MEDIUM"
      * When user specifies mood, energy, activity, genre, language, or exploration level (e.g. "play some chill hindi songs", "play high energy workout songs"), extract those structured attributes in 'play_media' (mood, energy, genre, language, activity, explorationLevel).
      * For "surprise me" or "discover new music", set explorationLevel: 'HIGH'.
      * For "play my usual music" or "play my favorites", set explorationLevel: 'LOW'.
      * Default mode is 'AUTOPLAY' for continuous smart radio playback.
    - DO NOT call 'open_application' for playback requests — 'open_application' only opens the app home screen, whereas 'play_media' triggers direct playback!
    - Media Playback Controls ('control_media'):
      * Whenever the user asks to pause, stop, resume, or skip music/audio (e.g. "pause", "pause the song", "pause music", "ruk jao", "hold on", "stop the music", "stop song", "turn off music", "resume", "continue playing", "play", "chalao", "next song", "skip", "change song"), you MUST invoke the 'control_media' tool with the corresponding command ('pause', 'resume', 'stop', 'next', 'previous')!
      * For dislike or rejection ("I don't like this song", "don't play this artist again", "never play this"), invoke 'control_media' with command: 'dislike'!
      * For like ("I love this song", "like this track"), invoke 'control_media' with command: 'like'!
      * For autoplay toggles ("turn autoplay off", "stop continuous music"), invoke 'control_media' with command: 'toggle_autoplay'!
      * NEVER generate text saying "Paused" or "Stopped" without executing 'control_media', because playback control on the phone ONLY happens when 'control_media' is executed.
- MANDATORY TOOL INVOCATION RULE: Whenever the user asks to open an app (e.g. "open WhatsApp", "launch YouTube"), call someone/dial a number (e.g. "call 9876543210", "make a video call to John"), or control/play media (e.g. "play believer", "pause music", "stop song"), you MUST invoke the corresponding tool ('open_application' or 'initiate_phone_call' or 'play_media' or 'control_media') in your tool call! NEVER generate text saying "Opening WhatsApp" or "Calling John" or "Playing Believer" or "Paused" without executing the tool, because native actions and media players ONLY trigger when the tool runs!
- If notification reading is unavailable (noContext: true in tool output), clearly explain that this feature requires the Jarvis APK build.

Developer Tools & Integration Ecosystem:
- External integrations (such as GitHub) are dynamically exposed as tools in your toolsConfig (e.g., 'github_get_repositories', 'github_get_repository', 'github_get_file_content', 'github_get_repository_tree', 'github_search_code', 'github_get_issues', 'github_create_issue', 'github_get_pull_requests', 'github_create_pull_request', 'github_get_commits', 'github_create_branch', 'github_commit_file_change', 'github_delete_file', 'github_merge_branch', 'github_update_pull_request', 'github_merge_pull_request').
- Deep Codebase Analysis & Repository Intelligence:
  • When the user asks to analyze, explain, debug, or answer technical questions about any codebase or repository (e.g. "What does this repo do?", "Explain how auth works in repo X", "Where is the payment logic?", "Inspect lines 20-80 of src/index.ts", "Find where database connections are pooled"):
    - Step 1 (Locate Code): Use 'github_search_code' to find matching functions, classes, symbols, or keywords, or 'github_get_repository_tree' to discover relevant source files and module hierarchy.
    - Step 2 (Inspect Real Code): Invoke 'github_get_file_content' to read the actual source code (pass startLine and endLine when reading specific functions or ranges).
    - Step 3 (Technical Synthesis): Ground your explanation directly in the retrieved code—reference exact function names, file paths, line numbers, and data structures. Never guess or hallucinate code implementations!
- Autonomous Code Modification & Pull Request Lifecycle:
  • When the user asks you to implement, fix, update, refactor, add a feature, or make any small or medium changes to a codebase or project:
    - MANDATORY BRANCH-AND-PR WORKFLOW (Never push directly to main/master!):
      1. Inspect & Understand: Use 'github_search_code', 'github_get_repository_tree', and 'github_get_file_content' to read existing files and context before writing changes.
      2. Create Feature Branch: ALWAYS create a dedicated branch first using 'github_create_branch' (e.g. branch: 'feat/feature-name' or 'fix/issue-description'). NEVER commit directly to 'main' or 'master'!
      3. Commit Code Changes: Use 'github_commit_file_change' to commit each created or modified file onto the newly created branch. If removing obsolete files, use 'github_delete_file'.
      4. Open Pull Request for Review: After committing all requested changes, ALWAYS invoke 'github_create_pull_request' to open a PR pulling your feature branch into the repository default branch (base: 'main' or 'master'). Include a clear, informative PR title and detailed summary of changes in the body so the user can review and approve it.
    - STRICT CODE QUALITY & ANTI-PLACEHOLDER RULES:
      • Absolutely ZERO placeholders, stubs, or shortcuts! NEVER write "// TODO: implement later", "/* remaining code unchanged */", "...rest of code...", or omit functions.
      • The code in 'github_commit_file_change' MUST BE complete, valid, production-ready, and functionally correct.
      • Ensure all imports, exports, type definitions, and dependencies required by your code changes are fully intact.
      • When modifying existing files, inspect the existing file contents first via 'github_get_file_content' so that the new committed file preserves the entire file with your modifications accurately integrated.
  • Pull Request Updates, Merging & Branch Merging:
    - Accepting / Merging Pull Requests: When the user asks to "merge PR #X", "accept pull request X", or "squash merge PR X":
      • Invoke 'github_merge_pull_request' with the pullNumber and mergeMethod ('merge' | 'squash' | 'rebase').
    - Updating Existing Pull Requests: When the user asks to "update PR #X title/body", "close PR X", "reopen PR X", or "change base branch of PR X":
      • Invoke 'github_update_pull_request' with pullNumber and desired fields to change.
    - Direct Branch Merging: When the user asks to "merge branch X into Y" directly (without a PR):
      • Invoke 'github_merge_branch' with base and head branch names.
- Context Awareness & Reference Resolution:
  1. Contextual Reference Resolution: When the user says "Create an issue for this", "File a bug about this", or "Open a PR for this":
     - Use recent conversation history to understand what "this" refers to (e.g., the specific error, bug, feature request, or code problem discussed).
     - Extract clean, normalized parameters: 'owner', 'repo', 'title', 'body', 'labels'.
     - If the repository isn't explicitly named, inspect recent conversation history or check user repositories via 'github_get_repositories' to resolve the active project.
  2. Native Capability Boundary: When the user combines an external service with scheduling (e.g., "Remind me to check this issue tomorrow at 10 AM"), ALWAYS use Jarvis's native reminder tools ('task_create' or 'event_reminder_create') instead of looking for time/reminder features inside integrations.
  3. Side Effect Awareness: Actions that create or mutate external code or items ('github_create_issue', 'github_create_pull_request', 'github_commit_file_change', 'github_delete_file', 'github_merge_branch', 'github_update_pull_request', 'github_merge_pull_request') are WRITE or DESTRUCTIVE actions with high risk that require user authorization.
  4. High-Density Repository Exploration:
     - To explore or understand a repository layout, architecture, or tech stack, ALWAYS prefer 'github_get_repository_overview' (fetches repository metadata, root file tree, README preview, and manifest in 1 single call) rather than sequentially calling separate tools.
     - When inspecting multiple files in a repository, use 'github_get_batch_files' to fetch up to 8 files concurrently in 1 single call.
  5. Budget Runway & Model Self-Steering:
     - If a tool response includes a '_budgetNotice', you are nearing your tool call budget. Immediately prioritize inspecting critical remaining files and steer toward synthesizing your complete final answer.
  6. Sub-Agent Delegation & Preliminary Shared Work:
     - When a complex task requires investigating multiple repositories (e.g. comparing or integrating "serenity" and "auto-youtube-channel"), multiple distinct services, or parallel research tracks:
       • Master Agent Does Preliminary Work First: Always perform common preliminary discovery first yourself (e.g. call 'github_get_repositories' to discover the exact repo names, owners, default branches, and basic metadata) so that individual sub-agents do NOT waste tool calls repeating this common discovery.
       • Pass Common Discoveries: When calling 'delegate_sub_task', supply these common findings in the 'initialContext' parameter (e.g. providing the confirmed repository owner, repo names, branches, and shared tech context).
       • Sub-Agent Deep Investigation: Sub-Agent 1 inspects repository A; Sub-Agent 2 inspects repository B, each using their isolated tool budget (up to 8 calls).
       • Master Synthesis: After receiving the substantive summaries from your delegated sub-agents, compile and synthesize the comprehensive final architectural blueprint or comparative analysis for the user.

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
- NEVER assume user local time is UTC and NEVER attach 'Z' directly to user local hours (e.g. 9:30 AM local in Asia/Kolkata is NOT 09:30:00Z; it is 09:30:00+05:30 or 04:00:00Z).`;

    const toolsConfig = toolRegistry.getGeminiFunctionDeclarations();

    try {
      // 3. Autonomous Multi-Step ReAct Loop
      while (stepCount < maxSteps) {
        stepCount++;
        toolContext.stepNumber = stepCount;

        // Call Gemini with tools and system instruction
        const response = await this.generateWithFallback({
          systemInstruction,
          contents: contents as never,
          toolsConfig: toolsConfig as never,
        });

        const functionCalls = response.functionCalls;

        // No more tool calls -> Final Assistant Answer
        if (!functionCalls || functionCalls.length === 0) {
          finalText = response.text?.trim() || '';

          const isTrivialConfirmation =
            !finalText ||
            ['done', 'done.', 'finished', 'finished.', 'ok', 'ok.', 'completed', 'completed.'].includes(
              finalText.toLowerCase().trim()
            );

          const isComplexQuery =
            message.length > 25 ||
            /architecture|design|overview|explain|capabilities|integrate|integration|how\s+to|what\s+all|plan|analysis|compare/i.test(
              message
            );

          if (isTrivialConfirmation && (isComplexQuery || executedToolCalls.length > 0)) {
            logger.info('Detected terse response on complex or tool-assisted query, triggering forced synthesis', {
              agentRunId: agentRun.id,
              originalText: finalText,
            });
            finalText = await this.synthesizeFinalAnswer({
              message,
              contents,
              systemInstruction,
              agentRunId: agentRun.id,
              stepNumber: stepCount + 1,
            });
          } else if (!finalText) {
            finalText = 'Done.';
          }

          responseMode = executedToolCalls.length > 0 ? 'ACTION' : 'ANSWER';

          // If a pending confirmation existed but no action was called (e.g. user cancelled or changed topic), cancel previous pending state
          if (activePendingConfirmation && executedToolCalls.length === 0 && toolContext.conversationId) {
            await prisma.agentStep.updateMany({
              where: {
                agentRun: { conversationId: toolContext.conversationId },
                type: 'CONFIRMATION',
                status: 'PENDING',
              },
              data: { status: 'SKIPPED' },
            }).catch(() => {});

            await prisma.agentRun.updateMany({
              where: {
                conversationId: toolContext.conversationId,
                status: 'WAITING_FOR_USER',
              },
              data: { status: 'CANCELLED' },
            }).catch(() => {});
          }

          const alreadyRecordedResponse = await prisma.agentStep.findFirst({
            where: {
              agentRunId: agentRun.id,
              type: 'RESPONSE',
            },
          });

          if (!alreadyRecordedResponse) {
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
          }

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

          // Trigger spoken intermediate status update (throttled & safe)
          if (
            options.onProgress &&
            (options.speakIntermediateStatus ?? true) &&
            speechThrottler.shouldSpeak()
          ) {
            speechThrottler.recordSpoken();
            const spokenText = spokenStatusFormatter.formatToolStatus(fcName, toolCall.input);
            let audioBase64: string | undefined = undefined;

            if (options.speakResponse) {
              try {
                const ttsRes = await ttsProvider.synthesize(spokenText);
                audioBase64 = ttsRes.audioBase64;
              } catch (ttsErr) {
                logger.warn('Intermediate status TTS synthesis warning', { error: String(ttsErr) });
              }
            }

            try {
              await options.onProgress({
                status: 'EXECUTING',
                toolName: fcName,
                spokenText,
                audioBase64,
                timestamp: Date.now(),
              });
            } catch (progErr) {
              logger.warn('Intermediate status onProgress callback warning', { error: String(progErr) });
            }
          }

          const isCanonicalMatch = (nameA: string, nameB: string) => {
            const normA = nameA.replace(/\./g, '_').toLowerCase();
            const normB = nameB.replace(/\./g, '_').toLowerCase();
            return normA === normB;
          };

          const isAuthorizedConfirmation =
            Boolean(activePendingConfirmation) &&
            isCanonicalMatch(fcName, activePendingConfirmation!.toolName);

          const autoApproveVal = (tool.integrationId && tool.actionType)
            ? integrationsConfig?.[tool.integrationId]?.autoApprove?.[tool.actionType]
            : undefined;
          const toolPolicy = (tool.actionType && tool.integrationId)
            ? integrationsConfig?.[tool.integrationId]?.policies?.[tool.actionType] ||
              (autoApproveVal === true ? 'ALLOW' : autoApproveVal === false ? 'ASK' : undefined)
            : undefined;

          // 1. Enforce DENY policy
          if (toolPolicy === 'DENY') {
            logger.warn('Tool execution blocked by user permission policy (DENY)', {
              toolName: tool.name,
              integrationId: tool.integrationId,
              actionType: tool.actionType,
            });
            return {
              text: `I cannot execute "${tool.name}" because ${tool.actionType} actions for ${tool.integrationId} are disallowed in your settings. You can enable them in Settings > Integrations.`,
              shouldSpeak: true,
              toolCalls: [toolCall],
              toolResults: [
                {
                  toolName: tool.name,
                  success: false,
                  output: null,
                  error: `Action disallowed by user permission policy: ${tool.actionType}`,
                  durationMs: 0,
                },
              ],
              conversationId: toolContext.conversationId,
              requestId: toolContext.requestId,
            };
          }

          const isAutoApprovedBySettings = toolPolicy === 'ALLOW';

          // Check if action requires confirmation:
          // 1. If tool policy is explicitly 'ASK', always require confirmation unless pre-authorized.
          // 2. Otherwise, require confirmation if not auto-approved and tool is critical/high risk.
          const requiresConfirmation =
            !isAuthorizedConfirmation &&
            (toolPolicy === 'ASK' ||
              (!isAutoApprovedBySettings &&
                (tool.requiresConfirmation || tool.riskLevel === 'CRITICAL' || tool.riskLevel === 'HIGH_RISK')));

          if (requiresConfirmation) {
            const pendingData = {
              actionId: toolCall.id,
              toolName: tool.name,
              riskLevel: tool.riskLevel,
              summary: `Execute ${tool.name} with ${JSON.stringify(toolCall.input)}`,
              payload: toolCall.input,
            };

            await prisma.agentStep.create({
              data: {
                agentRunId: agentRun.id,
                stepNumber: stepCount,
                type: 'CONFIRMATION',
                status: 'PENDING',
                input: JSON.stringify(pendingData),
                summary: `Awaiting user authorization for ${tool.name}`,
              },
            });

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
              pendingConfirmation: pendingData,
            };
          }

          if (isAuthorizedConfirmation) {
            logger.info('Authorized execution of confirmed pending tool via voice/NL', {
              toolName: tool.name,
              conversationId: toolContext.conversationId,
            });

            if (toolContext.conversationId) {
              await prisma.agentStep.updateMany({
                where: {
                  agentRun: { conversationId: toolContext.conversationId },
                  type: 'CONFIRMATION',
                  status: 'PENDING',
                },
                data: { status: 'COMPLETED' },
              }).catch(() => {});

              await prisma.agentRun.updateMany({
                where: {
                  conversationId: toolContext.conversationId,
                  status: 'WAITING_FOR_USER',
                },
                data: { status: 'EXECUTING' },
              }).catch(() => {});
            }

            activePendingConfirmation = undefined;
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

          const toolOutputOrError =
            toolRes.output !== undefined && toolRes.output !== null
              ? toolRes.output
              : { success: false, error: toolRes.error || 'Tool execution failed' };

          await prisma.agentStep.update({
            where: { id: stepRecord.id },
            data: {
              status: toolRes.success ? 'COMPLETED' : 'FAILED',
              output: JSON.stringify(toolOutputOrError),
              completedAt: new Date(),
            },
          });

          const funcResponsePayload: Record<string, unknown> =
            typeof toolOutputOrError === 'object' && toolOutputOrError !== null
              ? { ...(toolOutputOrError as Record<string, unknown>) }
              : { result: toolOutputOrError };

          const remainingCalls = maxToolCalls - totalToolCalls;
          if (remainingCalls <= 2 && remainingCalls > 0) {
            funcResponsePayload._budgetNotice = `[RUNWAY WARNING: You have ${remainingCalls} tool call(s) remaining before budget limit. Prioritize inspecting critical files and prepare your final comprehensive response.]`;
          }

          responseParts.push({
            functionResponse: {
              name: fcName,
              response: funcResponsePayload,
            },
          });
        }

        if (responseParts.length > 0) {
          contents.push({
            role: 'user',
            parts: responseParts,
          });
        }

        // If tool execution budget reached, synthesize comprehensive final answer immediately
        if (totalToolCalls >= maxToolCalls) {
          logger.info('Agent reached tool budget limit, triggering forced synthesis', {
            totalToolCalls,
            maxToolCalls,
            agentRunId: agentRun.id,
          });
          finalText = await this.synthesizeFinalAnswer({
            message,
            contents,
            systemInstruction,
            agentRunId: agentRun.id,
            stepNumber: stepCount + 1,
          });
          responseMode = executedToolCalls.length > 0 ? 'ACTION' : 'ANSWER';
          break;
        }
      }

      // If loop finished due to step limit, synthesize from executed tool outputs
      if (!finalText) {
        if (executedToolResults.length > 0) {
          logger.info('Step limit reached with executed tools, performing synthesis', {
            agentRunId: agentRun.id,
            executedToolsCount: executedToolResults.length,
          });
          finalText = await this.synthesizeFinalAnswer({
            message,
            contents,
            systemInstruction,
            agentRunId: agentRun.id,
            stepNumber: stepCount + 1,
          });
          responseMode = 'ACTION';
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
      'CALL_CONTACT',
      'SEND_SMS',
      'REPLY_TO_NOTIFICATION',
      'OPEN_APP',
      'OPEN_CONVERSATION',
      'PLAY_MEDIA',
      'OPEN_URL',
      'CONTROL_MEDIA',
    ]);

    let pendingPhoneAction: import('@jarvis/shared').JarvisPhoneAction | undefined;
    let scheduledReminder: import('@jarvis/shared').ScheduledReminder | undefined;

    for (const toolResult of executedToolResults) {
      const output = toolResult.output as Record<string, unknown> | null;
      if (output) {
        const actionSource =
          output.data && typeof output.data === 'object'
            ? (output.data as Record<string, unknown>)
            : output;
        const rawActionType = (
          (actionSource.type as string) ||
          (actionSource.action as string) ||
          ''
        ).toUpperCase();
        if (PHONE_ACTION_TYPES.has(rawActionType)) {
          pendingPhoneAction = {
            ...actionSource,
            type: rawActionType,
            action: rawActionType,
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

    const errDetail = err instanceof Error ? err.message : '';
    if (errDetail) {
      return `I encountered an issue processing that: ${errDetail}. Please try again.`;
    }

    return 'I was unable to process that request. Please try again.';
  }

  private async synthesizeFinalAnswer(params: {
    message: string;
    contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }>;
    systemInstruction: string;
    agentRunId: string;
    stepNumber: number;
  }): Promise<string> {
    const synthesisDirective = `[SYSTEM DIRECTIVE: SYNTHESIZE FINAL COMPREHENSIVE RESPONSE]:
You have finished gathering context and tool outputs (or reached your execution limit).
Do NOT call any more tools. Now, synthesize a comprehensive, in-depth, and well-structured final answer directly satisfying the user's request: "${params.message}".
Use all the observations, code snippets, and context gathered in this turn along with your software engineering and domain knowledge.
CRITICAL: Never reply with a one-word confirmation like "Done.", "Finished.", or "OK.". Deliver the full, detailed answer.`;

    const synthesisContents = [
      ...params.contents,
      {
        role: 'user',
        parts: [{ text: synthesisDirective }],
      },
    ];

    try {
      const response = await this.generateWithFallback({
        systemInstruction: params.systemInstruction,
        contents: synthesisContents,
        toolsConfig: [],
      });

      const synthesizedText = response.text?.trim() || '';
      if (synthesizedText) {
        await prisma.agentStep.create({
          data: {
            agentRunId: params.agentRunId,
            stepNumber: params.stepNumber,
            type: 'RESPONSE',
            status: 'COMPLETED',
            summary: 'Synthesized comprehensive final response',
            output: JSON.stringify({ text: synthesizedText }),
          },
        }).catch(() => {});

        return synthesizedText;
      }
    } catch (err) {
      logger.error('Error in synthesizeFinalAnswer', err, { agentRunId: params.agentRunId });
    }

    return 'I completed the necessary tool inspections, but was unable to produce the final synthesis. Please let me know how you would like me to proceed.';
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
