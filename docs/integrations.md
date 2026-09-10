# Jarvis Extensible Tool & App Integration Framework

## 1. Overview & Architecture

The Jarvis Tool & App Integration Framework is a modular, service-agnostic architecture designed to allow Jarvis to interact with external services, developer ecosystems, and third-party APIs through standardized tools exposed to Gemini LLM.

Jarvis Core and the Gemini LLM do **not** have hardcoded knowledge of external endpoints, OAuth flows, or platform-specific schemas. Instead, external services are encapsulated as modular **Integrations** containing **Tools** registered with a central **Integration Manager**.

```text
                           JARVIS CORE
                                |
                       Gemini Agent Planner
                                |
                     Unified Tool Registry
                                |
                    Integration Manager
                                |
    +---------------+---------------+---------------+
    |                               |
  GitHub                      [Future App]
Integration                   Integration
 (Modular)                     (Modular)
    |                               |
 GitHub REST                   Third-Party
    API                           API
```

---

## 2. Tool Architecture & Schemas

Every capability exposed to Gemini is encapsulated as an `IntegrationTool` (extending `BaseIntegrationTool`):

```text
Tool
├── id                     (Predictable hierarchical ID: <service>.<action>, e.g. github.create_issue)
├── name                   (Gemini-safe identifier, e.g. github_create_issue)
├── description            (Clear semantic summary for LLM planning)
├── integrationId          (Parent integration ID, e.g. 'github')
├── inputSchema            (Zod schema validating all input parameters machine-readably)
├── outputSchema           (Zod schema for structured output)
├── actionType             (READ | WRITE | DESTRUCTIVE | EXTERNAL_ACTION)
├── riskLevel              (SAFE | LOW_RISK | HIGH_RISK | CRITICAL)
├── requiresConfirmation   (Boolean enforcing human approval on destructive/write actions)
├── permissions            (Declared scopes/permissions required, e.g. ['repo', 'read:org'])
└── executor               (Pure async function returning StandardToolResult)
```

### Standardized Tool Result (`StandardToolResult`)

Gemini receives normalized structured results rather than large raw HTTP payloads:

```typescript
export interface StandardToolResult<T = unknown> {
  success: boolean;
  data: T | null;               // Concise structured data for LLM reasoning
  message?: string;             // Human-friendly natural language summary
  error?: {
    code: string;               // e.g. 'INVALID_PARAMETERS', 'AUTH_REQUIRED', 'RATE_LIMITED'
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
  requiresUserAction?: boolean;
}
```

---

## 3. Dynamic Registration & Discovery

1. When the Jarvis server initializes, all enabled integrations are registered with `integrationManager.register(integration)`.
2. The `ToolRegistry` aggregates built-in core tools (`calculator`, `task_*`, `memory_*`, `event_*`, `phone_*`) with `integrationManager.getAllActiveTools()`.
3. `toolRegistry.getGeminiFunctionDeclarations()` translates tools into Gemini function declarations:
   - Periods (`.`) are mapped to underscores (`_`) (e.g. `github.create_issue` -> `github_create_issue`) to conform to Gemini identifier constraints.
   - Zod schemas are converted into JSON Schemas.
4. When an integration is disabled via `integrationManager.disableIntegration('github')`:
   - Its tools are immediately removed from `getAllActiveTools()`.
   - Subsequent Gemini calls will not see or invoke those tools.
5. When Gemini calls a function with an underscore name, `toolRegistry.getTool()` maps it back to the canonical tool instance.

---

## 4. Authentication & Security Model

1. **Zero Secret Leaks**: Credentials (API tokens, OAuth secrets) are kept strictly server-side in `apps/brain`. They are never passed to the mobile bundle, never included in tool descriptions, and never logged in debug outputs.
2. **Modular Credential Lifecycle**: Each service implements a dedicated `<ServiceName>Auth.ts` class handling:
   - Reading from environment variables (`process.env.GITHUB_TOKEN`) or dynamic token storage.
   - Token validation via external verification endpoints (`https://api.github.com/user`).
   - Clean disconnection and token invalidation.
3. **Audit Logging**: Every tool execution is recorded in the PostgreSQL `ToolExecution` table with latency, parameters, and status.

---

## 5. Permissions, Risk Levels & Confirmation

Every tool declares its action type and risk profile:

| Action Type | Typical Risk Level | Confirmation Required | Example Tools |
| :--- | :--- | :--- | :--- |
| `READ` | `SAFE` | No | `github.get_repositories`, `github.get_issues`, `github.get_commits` |
| `WRITE` | `HIGH_RISK` | Yes | `github.create_issue`, `github.create_pull_request` |
| `DESTRUCTIVE` | `CRITICAL` | Yes | Repository deletion, branch purge |
| `EXTERNAL_ACTION` | `HIGH_RISK` | Yes | Sending emails, external webhooks |

---

## 6. Execution Lifecycle Pipeline

The standardized request and execution pipeline:

```text
User Natural Request: "Create an issue for this bug"
     ↓
Gemini LLM (inspects recent conversation context to extract owner, repo, title, body)
     ↓
Gemini Function Call: github_create_issue({ owner, repo, title, body })
     ↓
ToolRegistry (resolves function name -> IntegrationTool)
     ↓
BaseIntegrationTool.execute()
     ├── 1. Validates inputSchema via Zod safeParse()
     │      (If invalid -> returns { success: false, error: { code: 'INVALID_PARAMETERS' } })
     ├── 2. Verifies requiresConfirmation status
     └── 3. Invokes Tool Executor
     ↓
GitHubClient.request() (Appends Bearer token, enforces 15s AbortSignal timeout)
     ↓
GitHub REST API (/repos/:owner/:repo/issues)
     ↓
Normalized StandardToolResult returned to Gemini
     ↓
Gemini generates polished conversational response to User
```

---

## 7. Error Handling & Resilience

The framework standardizes and translates errors across all stages:

- **Invalid Parameters**: Automatically rejected by `BaseIntegrationTool` using Zod validation before touching the network.
- **Authentication Failure (401)**: Translated into `"GitHub authentication expired or token invalid. Please reconnect your GitHub token."`
- **Rate Limits & Forbidden (403)**: Translated into `"GitHub API rate limit exceeded or access forbidden."`
- **Resource Not Found (404)**: Translated into `"GitHub resource not found at <endpoint>."`
- **Validation Errors (422)**: Parsed and reported with clear issue descriptions.
- **Network Timeouts**: Protected by a 15-second `AbortSignal` timeout, translating into `"GitHub API request to <path> timed out after 15 seconds."`
- **Unavailable / Disabled Integration**: Returns `TOOL_UNAVAILABLE` error without throwing unhandled exceptions.

---

## 8. Existing Integration: GitHub

The GitHub integration is implemented under `apps/brain/src/modules/integrations/github/`:

```text
apps/brain/src/modules/integrations/github/
├── GitHubAuth.ts                # Token lifecycle & /user validation
├── GitHubClient.ts              # REST client with AbortSignal timeout & error mapping
├── GitHubIntegration.ts         # BaseIntegration lifecycle & tool registration
├── index.ts                     # Barrel exports
└── tools/
    ├── GetRepositoriesTool.ts   # github.get_repositories (READ, SAFE)
    ├── GetRepositoryTool.ts     # github.get_repository (READ, SAFE)
    ├── GetIssuesTool.ts         # github.get_issues (READ, SAFE)
    ├── CreateIssueTool.ts       # github.create_issue (WRITE, HIGH_RISK, Confirmed)
    ├── GetPullRequestsTool.ts   # github.get_pull_requests (READ, SAFE)
    ├── CreatePullRequestTool.ts # github.create_pull_request (WRITE, HIGH_RISK, Confirmed)
    └── GetCommitsTool.ts        # github.get_commits (READ, SAFE)
```

### GitHub Tool Code Walkthrough: `CreateIssueTool.ts`

```typescript
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

---

## 9. Creating a New Integration

To implement any new service (e.g., Spotify, Slack, Notion, Home Assistant):

1. **Scaffold from Template**:
   Copy `apps/brain/src/modules/integrations/template/` to `apps/brain/src/modules/integrations/<service-name>/`.
2. **Implement `<ServiceName>Auth.ts`**:
   Define token/key management and connection validation.
3. **Implement `<ServiceName>Client.ts`**:
   Encapsulate external API calls, HTTP status translation, and timeouts.
4. **Implement Tools in `tools/`**:
   Create dedicated files for each tool extending `BaseIntegrationTool`.
5. **Register in `<ServiceName>Integration.ts`**:
   Instantiate tools and register via `this.registerTool(new Tool(this.client))`.
6. **Export & Register**:
   Export from `index.ts` and register with `integrationManager.register(instance)`.

---

## 10. Using the Integration Development Skill

The standardized engineering workflow is codified in the developer skill:
`file:///.agents/skills/jarvis-integration-developer/SKILL.md`

Whenever you or an AI agent needs to add a new integration, activate the skill and follow its 14-stage checklist. It contains the complete self-contained answers to all 13 core fundamentals, directory conventions, and verification steps.
