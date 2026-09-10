---
name: jarvis-tool-builder
description: Standardized engineering workflow, code patterns, and checklist for adding a proper, production-grade Tool to any integration in Jarvis (e.g. GitHub, Spotify, Slack, Notion, Home Assistant).
---

# Jarvis Integration Tool Builder Skill

This skill provides the definitive, standardized blueprint for creating and registering a **proper Tool** within any Jarvis integration.

Whenever you need to expose a new capability, endpoint, or action from an external service to the Jarvis Brain and Gemini LLM, **follow this skill strictly**.

---

## 1. Core Architectural Constraints & Rules

Every tool in Jarvis must strictly follow these workspace engineering rules:

1. **One Class Per File (Rule 2 & Section 20)**:
   Place each tool in its own dedicated file under `apps/brain/src/modules/integrations/<service-name>/tools/<ActionName>Tool.ts`. Never inline multiple tools into a single file or inside the integration class.
2. **Pure Executor Architecture (Rules 37-39)**:
   The LLM (Gemini) is the sole semantic engine for entity resolution, query normalization, and parameter extraction. The tool's `executor()` is a **pure executor**—it must NEVER perform custom regex parsing, string slicing, keyword stripping, or command heuristics. It receives clean, typed parameters directly from the LLM.
3. **Machine-Readable Input Validation (Rule 7 & Section 4)**:
   Every tool must define a Zod `inputSchema` with explicit `.describe(...)` annotations on every field. `BaseIntegrationTool` automatically validates parameters via `safeParse()` before calling the executor.
4. **Human Confirmation for Side Effects (Rule 12 & Section 8)**:
   Any tool that creates, updates, deletes, or triggers external side effects must declare:
   - `actionType: 'WRITE' | 'DESTRUCTIVE' | 'EXTERNAL_ACTION'`
   - `riskLevel: 'HIGH_RISK' | 'CRITICAL'`
   - `requiresConfirmation: true`
5. **Succinct Normalized Results (Rule 9 & Section 9)**:
   Always return `StandardToolResult<TOutput>`. Never dump huge raw HTTP responses into the conversation context. Extract only the concise fields the LLM needs to reason and summarize.
6. **No Fake Functionality (Rule 22 & Section 14)**:
   Never return simulated success when an action did not execute. If credentials are missing, API calls fail, or rate limits are hit, return structured errors indicating setup or reconnection needs.
7. **Native Capability Reuse (Section 15)**:
   If a user asks to schedule an action or set a reminder for a tool (e.g., "Remind me to check this PR tomorrow"), always rely on Jarvis's native reminder tools (`task_create`, `event_reminder_create`) instead of inventing custom time logic inside the integration tool.

---

## 2. The Anatomy of a Proper Tool

Every tool extends `BaseIntegrationTool<TInput, TOutput>`:

```typescript
import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { <ServiceName>Client, <ResponseType> } from '../<ServiceName>Client';

export class <ActionName>Tool extends BaseIntegrationTool<
  <InputType>,
  <OutputType>
> {
  constructor(client: <ServiceName>Client) {
    super({
      // 1. Identification
      id: '<service>.<action>',          // Hierarchical ID (e.g. 'github.create_issue', 'spotify.play')
      name: '<service>.<action>',        // Canonical name (registry converts dots to underscores for Gemini)
      description: 'Clear description of what the tool does and when the LLM should invoke it.',
      integrationId: '<service>',        // Parent integration identifier (e.g. 'github')

      // 2. Classification & Permissions
      category: 'PRODUCTIVITY',          // ToolCategory ('PRODUCTIVITY' | 'COMMUNICATION' | 'SYSTEM' | etc.)
      actionType: 'READ',                // 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'EXTERNAL_ACTION'
      riskLevel: 'SAFE',                 // 'SAFE' | 'LOW_RISK' | 'HIGH_RISK' | 'CRITICAL'
      requiresConfirmation: false,       // Must be true for WRITE, DESTRUCTIVE, or EXTERNAL_ACTION
      permissions: ['scope:read'],       // Scopes/permissions required from external service

      // 3. Machine-Readable Input Schema
      inputSchema: z.object({
        query: z.string().min(1).describe('The search query or target identifier'),
        limit: z.number().min(1).max(30).default(10).describe('Maximum results to return'),
      }),

      // 4. Pure Executor
      executor: async (input, context) => {
        const data = await client.<clientMethod>(input.query, input.limit);
        return {
          success: true,
          data,
          message: `Successfully executed <action>.`,
        };
      },
    });
  }
}
```

---

## 3. Step-by-Step 8-Stage Tool Creation Checklist

Follow this checklist whenever adding a tool to any integration:

```text
[ ] Stage 1: Inspect External API & Client Method
              • Verify client method exists in <ServiceName>Client.ts.
              • If not, add the typed method and clean summary interfaces to <ServiceName>Client.ts.
              • Ensure client encapsulates error translation (401, 403, 404, 429, timeout).

[ ] Stage 2: Create Tool File
              • Path: apps/brain/src/modules/integrations/<service-name>/tools/<ActionName>Tool.ts
              • Name the class <ActionName>Tool (e.g. GetIssuesTool, CreateIssueTool).

[ ] Stage 3: Define Zod Input Schema
              • Create z.object({...}) with rich .describe() text on every field.
              • Add sensible constraints (.min(), .max(), .default(), .optional()).
              • Keep fields pure and normalized (no command verbs or platform prefixes in parameters).

[ ] Stage 4: Set Action Type, Risk Level, and Confirmation
              • READ actions:
                actionType: 'READ', riskLevel: 'SAFE', requiresConfirmation: false
              • WRITE actions:
                actionType: 'WRITE', riskLevel: 'HIGH_RISK', requiresConfirmation: true
              • DESTRUCTIVE actions:
                actionType: 'DESTRUCTIVE', riskLevel: 'CRITICAL', requiresConfirmation: true

[ ] Stage 5: Implement Pure Executor
              • Call client method using validated input parameters.
              • Return StandardToolResult with success: true, concise structured data, and human message.
              • Do not catch errors inside executor unless transforming them; BaseIntegrationTool
                automatically catches unhandled errors and maps them to StandardToolResult with code: 'EXECUTION_ERROR'.

[ ] Stage 6: Register in <ServiceName>Integration.ts
              • Import <ActionName>Tool.
              • In registerTools(), call: this.registerTool(new <ActionName>Tool(this.client)).

[ ] Stage 7: Re-export in index.ts
              • Export class from apps/brain/src/modules/integrations/<service-name>/index.ts.

[ ] Stage 8: Add Unit Tests & Verify
              • In apps/brain/src/__tests__/integration-framework.test.ts:
                1. Test valid execution with mocked client.
                2. Test invalid parameter rejection (Zod error).
                3. Test confirmation flag matches risk level.
              • Run: npm run typecheck --workspace=apps/brain
              • Run: npm run test --workspace=apps/brain
```

---

## 4. Reference Implementations

### Pattern A: Read-Only Tool (`READ`, `SAFE`, No Confirmation)

```typescript
// apps/brain/src/modules/integrations/github/tools/GetRepositoriesTool.ts
import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubRepoSummary } from '../GitHubClient';

export class GetRepositoriesTool extends BaseIntegrationTool<
  { limit?: number },
  GitHubRepoSummary[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_repositories',
      name: 'github.get_repositories',
      description: 'List repositories for the authenticated user or organization',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        limit: z.number().min(1).max(30).default(10).describe('Maximum number of repositories to return'),
      }),
      executor: async (input) => {
        const repos = await client.getRepositories(input.limit || 10);
        return {
          success: true,
          data: repos,
          message: `Retrieved ${repos.length} GitHub repositories.`,
        };
      },
    });
  }
}
```

### Pattern B: Write / Side-Effect Tool (`WRITE`, `HIGH_RISK`, Requires Confirmation)

```typescript
// apps/brain/src/modules/integrations/github/tools/CreateIssueTool.ts
import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubIssueSummary } from '../GitHubClient';

export class CreateIssueTool extends BaseIntegrationTool<
  { owner: string; repo: string; title: string; body?: string; labels?: string[] },
  GitHubIssueSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.create_issue',
      name: 'github.create_issue',
      description: 'Create a new issue in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['repo'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        title: z.string().min(1).describe('Issue title'),
        body: z.string().optional().describe('Issue description/body content'),
        labels: z.array(z.string()).optional().describe('Optional list of issue labels'),
      }),
      executor: async (input) => {
        const issue = await client.createIssue(
          input.owner,
          input.repo,
          input.title,
          input.body,
          input.labels
        );
        return {
          success: true,
          data: issue,
          message: `Successfully created issue #${issue.number} "${issue.title}" in ${input.owner}/${input.repo}. URL: ${issue.url}`,
        };
      },
    });
  }
}
```

### Pattern C: Destructive Action Tool (`DESTRUCTIVE`, `CRITICAL`, Requires Confirmation)

```typescript
export class DeleteResourceTool extends BaseIntegrationTool<
  { id: string; reason?: string },
  { deleted: boolean; id: string }
> {
  constructor(client: AnyServiceClient) {
    super({
      id: 'service.delete_resource',
      name: 'service.delete_resource',
      description: 'Permanently delete a resource (CRITICAL: requires explicit confirmation)',
      integrationId: 'service',
      category: 'PRODUCTIVITY',
      actionType: 'DESTRUCTIVE',
      riskLevel: 'CRITICAL',
      requiresConfirmation: true,
      permissions: ['admin:write'],
      inputSchema: z.object({
        id: z.string().min(1).describe('The unique identifier of the resource to delete'),
        reason: z.string().optional().describe('Reason for deletion'),
      }),
      executor: async (input) => {
        await client.deleteResource(input.id);
        return {
          success: true,
          data: { deleted: true, id: input.id },
          message: `Permanently deleted resource ${input.id}.`,
        };
      },
    });
  }
}
```

---

## 5. Common Pitfalls & Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | What to Do Instead |
| :--- | :--- | :--- |
| **Inlining tools into `<ServiceName>Integration.ts`** | Violates Rule 2 & Section 20 modularity. Files become bloated and hard to test. | Place each tool class in `tools/<ActionName>Tool.ts`. |
| **String parsing / regex stripping inside tool executor** | Violates Rules 37-39. Deterministic heuristics fail on varied natural phrasing and multilinguality. | Keep tool executor pure. LLM extracts clean, normalized parameters directly into the Zod schema. |
| **Dumping raw API payloads into tool result** | Saturates the LLM context window with multi-kilobyte JSON metadata, causing slowdowns or truncation. | Map external responses to a concise summary interface (`name`, `id`, `url`, `status`). |
| **Missing `requiresConfirmation: true` on side effects** | Violates Rule 12. Actions like creating issues, sending emails, or deleting data execute without user consent. | Set `requiresConfirmation: true` and `riskLevel: 'HIGH_RISK'` or `'CRITICAL'`. |
| **Omitting `.describe(...)` on Zod schema fields** | Gemini LLM receives a blank description and hallucinates parameter meanings or fails to supply required values. | Always add `.describe('...')` to every field in `z.object({...})`. |
| **Hardcoding API tokens inside tool files** | Violates Rule 6. Leaks secrets and prevents dynamic user credential switching. | Inject `<ServiceName>Client`, which reads tokens securely via `<ServiceName>Auth`. |
| **Inventing parallel reminder/scheduling tools** | Violates Section 15 context awareness. | Direct the LLM to use native `task_create` or `event_reminder_create` for scheduling. |

---

## 6. Verification Commands

After creating any new tool, always run:

```bash
# 1. Typecheck the Brain workspace
npm run typecheck --workspace=apps/brain

# 2. Run the integration test suite
npm run test --workspace=apps/brain -- src/__tests__/integration-framework.test.ts
```
