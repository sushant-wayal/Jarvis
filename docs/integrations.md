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

1. **Zero Secret Leaks**: Credentials (API tokens, OAuth secrets, refresh tokens) are kept strictly server-side in `apps/brain`. They are never passed to the mobile client bundle, never included in tool descriptions, and never logged in debug outputs.
2. **Modular Credential Lifecycle**: Each service implements a dedicated `<ServiceName>Auth.ts` class handling:
   - Reading from environment variables (`process.env.GITHUB_TOKEN`, `process.env.GOOGLE_CLIENT_ID`) or dynamic user credential storage.
   - Token validation via external verification endpoints (`https://api.github.com/user`, `https://gmail.googleapis.com/gmail/v1/users/me/profile`).
   - Clean disconnection: Clearing stored access and refresh tokens upon disconnect.
   - Re-authentication: Re-enabling an OAuth integration prompts the user to reconnect if tokens are missing.
3. **OAuth 2.0 & Auto-Refresh**: For OAuth services (such as Gmail), Jarvis manages authorization code exchange, access token expiration, and background refresh via `refreshToken`:
   - Endpoint `GET /api/v1/integrations/google/auth-url`: Generates consent screen URL requesting offline access (`access_type=offline`, `prompt=consent`).
   - Endpoint `GET /api/v1/integrations/google/callback`: Exchanges authorization code for `access_token` and `refresh_token`, storing them securely in `User.preferences.integrations[service]`.
   - `GmailAuth.ensureFreshToken()` automatically requests a new access token via Google's token endpoint when expired.
4. **Audit Logging**: Every tool execution is recorded in the PostgreSQL `ToolExecution` table with latency, parameters, risk level, and completion status.

---

## 5. Granular Permissions & Control Model (`Allow` | `Ask` | `Deny`)

Every tool specifies a baseline action classification and risk profile:

| Action Type | Typical Risk Level | Default Confirmation | Description |
| :--- | :--- | :--- | :--- |
| `READ` | `SAFE` | No | Read-only lookups (e.g. `gmail.list_emails`, `github.get_issues`) |
| `WRITE` | `HIGH_RISK` | Yes | Local or external mutations (e.g. `gmail.create_draft`, `github.create_issue`) |
| `EXTERNAL_ACTION` | `HIGH_RISK` | Yes | Outbound communication (e.g. `gmail.send_email`, `gmail.reply_email`) |
| `DESTRUCTIVE` | `CRITICAL` | Yes | Permanent deletion (e.g. `gmail.trash_email`, `serenity.remove_video_idea`) |

### Three-State Permission Policies
Users configure permissions in the mobile app under **Settings → Integrations → Tool Permissions**:

- **`ALLOW` (Pre-Authorized / Auto-Execute)**:
  - Bypasses interactive confirmation cards.
  - Jarvis executes the tool immediately during the conversation turn.
  - Injected into the Gemini LLM system prompt under `[PRE-AUTHORIZED ACTIONS - DIRECT EXECUTION]`.
- **`ASK` (Interactive Human Confirmation)**:
  - Agent loop pauses before execution (`mode: 'CONFIRMATION'`).
  - Mobile UI presents an interactive confirmation card with parameters, risk badge, and `[Approve & Execute]` / `[Reject]`.
- **`DENY` (Hard Blocked)**:
  - The tool is completely disabled from execution.
  - If requested, the planner immediately stops and informs the user that the tool is disabled in settings.
  - Injected into the Gemini LLM system prompt under `[DISALLOWED ACTIONS - BLOCKED BY USER]`.

### Policy Resolution Precedence
When an agent step selects a tool, the effective policy is determined with strict precedence:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Tool-Specific Policy                                     │
│    User.preferences.integrations[id].toolPolicies[tool.name]│
└──────────────────────────────┬──────────────────────────────┘
                               │ (if undefined)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Action-Type Policy                                       │
│    User.preferences.integrations[id].policies[actionType]   │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if undefined)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Baseline Tool Default                                    │
│    tool.requiresConfirmation ? 'ASK' : 'ALLOW'              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Execution Lifecycle Pipeline

The standardized request and execution pipeline:

```text
User Natural Request: "Send an email to alex@example.com about the meeting"
     ↓
Gemini LLM (inspects recent context + [PRE-AUTHORIZED / DISALLOWED] directives)
     ↓
Gemini Function Call: gmail_send_email({ to: "alex@example.com", subject: "...", body: "..." })
     ↓
Agent Planner (resolves effective policy for gmail.send_email)
     ├── DENY  ──> Stop immediately; return friendly "Tool is blocked in settings" notice
     ├── ASK   ──> Save AgentStep (status: PENDING, mode: CONFIRMATION); prompt user in mobile UI
     └── ALLOW ──> Pre-authorized; proceed to execute directly
                   ↓
BaseIntegrationTool.execute()
     ├── 1. Validates inputSchema via Zod safeParse()
     ├── 2. Invokes Tool Executor
     ↓
GmailClient.request() (Attaches fresh OAuth Bearer token, enforces 15s timeout)
     ↓
Gmail REST API (https://gmail.googleapis.com/gmail/v1/users/me/messages/send)
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

## 9. Existing Integration: Serenity (Autonomous YouTube Channel)

The **Serenity** integration connects Jarvis with the user's autonomous YouTube channel pipeline (`auto-youtube-channel`). Serenity automatically generates, voices, visualizes, assembles, and publishes daily YouTube videos and 2–3 Shorts without manual intervention.

```text
apps/brain/src/modules/integrations/serenity/
├── SerenityAuth.ts              # API Key management, URL resolution, /api/settings validation
├── SerenityClient.ts            # REST client with AbortSignal timeout & error mapping
├── SerenityIntegration.ts       # BaseIntegration lifecycle & tool registration
├── index.ts                     # Barrel exports
└── tools/
    ├── GetPipelineStatusTool.ts      # serenity.get_pipeline_status (READ, SAFE)
    ├── TriggerVideoGenerationTool.ts # serenity.trigger_video_generation (WRITE, HIGH_RISK, Confirmed)
    ├── RetryFailedJobsTool.ts        # serenity.retry_failed_jobs (WRITE, HIGH_RISK, Confirmed)
    ├── GetHistoryTool.ts             # serenity.get_history (READ, SAFE)
    ├── GetAnalyticsTool.ts           # serenity.get_analytics (READ, SAFE)
    ├── GetIdeasQueueTool.ts          # serenity.get_ideas_queue (READ, SAFE)
    ├── AddVideoIdeaTool.ts           # serenity.add_video_idea (WRITE, HIGH_RISK, Confirmed)
    ├── ReorderVideoIdeaTool.ts       # serenity.reorder_video_idea (WRITE, HIGH_RISK, Confirmed)
    ├── RemoveVideoIdeaTool.ts        # serenity.remove_video_idea (DESTRUCTIVE, HIGH_RISK, Confirmed)
    ├── GetSeriesTool.ts              # serenity.get_series (READ, SAFE)
    ├── CreateSeriesTool.ts           # serenity.create_series (WRITE, HIGH_RISK, Confirmed)
    ├── UpdateScheduleTool.ts         # serenity.update_schedule (WRITE, HIGH_RISK, Confirmed)
    ├── GetSettingsTool.ts            # serenity.get_settings (READ, SAFE)
    ├── UpdateSettingsTool.ts         # serenity.update_settings (WRITE, HIGH_RISK, Confirmed)
    ├── GenerateScriptPreviewTool.ts  # serenity.generate_script_preview (READ, SAFE)
    └── GenerateThumbnailTool.ts      # serenity.generate_thumbnail (WRITE, HIGH_RISK, Confirmed)
```

### Configuration:
- `SERENITY_API_KEY`: Authentication key for Serenity endpoints.
- `SERENITY_BASE_URL`: Base URL for the Serenity API (e.g. `https://vid-stack.vercel.app` or `http://localhost:3000`).

---

---

## 10. Existing Integration: North (Personal Financial Advisor)

The **North** integration connects Jarvis with the user's personal financial advisor system (`movenorth.vercel.app`). North tracks accounts, transactions, investments, goals, emergency runway, recurring subscriptions, and AI financial planning memories, while delegating complex scenarios to its embedded advisor loop.

```text
apps/brain/src/modules/integrations/north/
├── NorthAuth.ts                     # Base URL & API Key management, /api/dashboard/overview verification
├── NorthClient.ts                   # REST client encapsulating all PFA endpoints & error translation
├── NorthIntegration.ts              # BaseIntegration lifecycle & 17 tool registrations
├── index.ts                         # Barrel exports
└── tools/
    ├── GetFinancialContextTool.ts     # north.get_financial_context (READ, SAFE)
    ├── GetDashboardOverviewTool.ts    # north.get_dashboard_overview (READ, SAFE)
    ├── QueryTransactionsTool.ts       # north.query_transactions (READ, SAFE)
    ├── AddTransactionTool.ts          # north.add_transaction (WRITE, HIGH_RISK, Confirmed)
    ├── EvaluateAffordabilityTool.ts   # north.evaluate_affordability (READ, SAFE)
    ├── GetGoalsTool.ts                # north.get_goals (READ, SAFE)
    ├── CreateGoalTool.ts              # north.create_goal (WRITE, HIGH_RISK, Confirmed)
    ├── GetNetworthTool.ts             # north.get_networth (READ, SAFE)
    ├── GetInvestmentSuggestionTool.ts # north.get_investment_suggestion (READ, SAFE)
    ├── RecordInvestmentTool.ts        # north.record_investment (WRITE, HIGH_RISK, Confirmed)
    ├── TriggerGmailSyncTool.ts        # north.trigger_gmail_sync (EXTERNAL_ACTION, HIGH_RISK, Confirmed)
    ├── SearchConversationsTool.ts     # north.search_conversations (READ, SAFE)
    ├── QueryMemoriesTool.ts           # north.query_memories (READ, SAFE)
    ├── SaveMemoryTool.ts              # north.save_memory (WRITE, HIGH_RISK, Confirmed)
    ├── AskAdvisorTool.ts              # north.ask_advisor (READ, SAFE)
    ├── GetEmergencyFundStatusTool.ts  # north.get_emergency_fund_status (READ, SAFE)
    └── GetSubscriptionsTool.ts        # north.get_subscriptions (READ, SAFE)
```

### Configuration:
- `NORTH_BASE_URL`: Base URL for North API (defaults to `https://movenorth.vercel.app` or `http://localhost:3000`).
- `NORTH_API_KEY` / `NORTH_CRON_SECRET`: Optional Bearer token or Cron Secret for protected endpoints.

---

---

## 11. Existing Integration: Gmail (Email Management)

The **Gmail** integration connects Jarvis with the user's Google Workspace/Gmail account. Jarvis can search, read, draft, send, reply to emails, modify labels (mark read/unread, star, archive), and move emails to trash with strict risk classifications and user confirmations.

```text
apps/brain/src/modules/integrations/gmail/
├── GmailAuth.ts                     # Token lifecycle, auto-refresh via Google OAuth2, profile validation
├── GmailClient.ts                   # REST client encapsulating Gmail API v1 with MIME RFC 2822 formatting
├── GmailIntegration.ts              # BaseIntegration lifecycle & 10 tool registrations
├── index.ts                         # Clean barrel export
└── tools/
    ├── ListEmailsTool.ts            # gmail.list_emails (READ, SAFE)
    ├── GetEmailTool.ts              # gmail.get_email (READ, SAFE)
    ├── ListThreadsTool.ts           # gmail.list_threads (READ, SAFE)
    ├── GetThreadTool.ts             # gmail.get_thread (READ, SAFE)
    ├── SendEmailTool.ts             # gmail.send_email (EXTERNAL_ACTION, HIGH_RISK, Confirmed)
    ├── CreateDraftTool.ts           # gmail.create_draft (WRITE, LOW_RISK)
    ├── ReplyEmailTool.ts            # gmail.reply_email (EXTERNAL_ACTION, HIGH_RISK, Confirmed)
    ├── ModifyEmailLabelsTool.ts     # gmail.modify_labels (WRITE, LOW_RISK)
    ├── TrashEmailTool.ts            # gmail.trash_email (DESTRUCTIVE, HIGH_RISK, Confirmed)
    └── GetProfileTool.ts            # gmail.get_profile (READ, SAFE)
```

### Configuration:
- `GMAIL_ACCESS_TOKEN` or `GOOGLE_ACCESS_TOKEN`: Bearer access token for Gmail API (`https://mail.google.com/`).
- `GMAIL_REFRESH_TOKEN`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`: Optional OAuth2 credentials for automatic token refreshing.
- Runtime connection via Google OAuth2:
  - `GET /api/v1/integrations/google/auth-url` returns the consent screen URL.
  - `GET /api/v1/integrations/google/callback` receives the authorization code, exchanges it for tokens, stores them in user preferences, and redirects back to the mobile app.

---

## 12. REST API & Mobile UI Settings

The framework provides first-class endpoints supporting mobile integration management and real-time permission configuration:

### `GET /api/v1/integrations`
Returns all integrations with dynamic tool introspection:
```json
{
  "success": true,
  "data": [
    {
      "id": "gmail",
      "name": "Gmail",
      "description": "Read, search, draft, send, reply to emails and organize labels.",
      "category": "COMMUNICATION",
      "isEnabled": true,
      "isConfigured": true,
      "authType": "OAUTH",
      "policies": {
        "READ": "ALLOW",
        "WRITE": "ASK",
        "EXTERNAL_ACTION": "ASK",
        "DESTRUCTIVE": "DENY"
      },
      "toolPolicies": {
        "gmail.send_email": "ALLOW",
        "gmail.trash_email": "DENY"
      },
      "tools": [
        {
          "id": "gmail.send_email",
          "name": "Send Email",
          "description": "Send emails directly from your Gmail account",
          "actionType": "EXTERNAL_ACTION",
          "riskLevel": "HIGH_RISK",
          "policy": "ALLOW"
        }
      ]
    }
  ]
}
```

### `POST /api/v1/integrations`
Supports management actions:
- `toggle`: `{ action: "toggle", id: "gmail", enabled: true }`
- `disconnect`: `{ action: "disconnect", id: "gmail" }` (clears credentials)
- `updatePermissions`: `{ action: "updatePermissions", id: "gmail", policies: { ... }, toolPolicies: { "gmail.send_email": "ALLOW" } }`

### Mobile UI Settings Screen (`apps/mobile/app/integrations.tsx`)
- Navigated seamlessly from **Settings → Integrations**.
- Zero-latency optimistic UI updates for toggling integrations and updating segmented controls (`[ Allow | Ask | Deny ]`).
- Collapsible tool list with tool count indicator (`Tool Permissions (X tools)`).
- Visual action badges (`Read`, `Write`, `Outbound`, `Destructive`) and active status badges (`Auto-Executes`, `Asks in Chat`, `Blocked`).

---

## 13. Creating a New Integration

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

## 14. Using the Integration Development Skill

The standardized engineering workflow is codified in the developer skill:
`file:///.agents/skills/jarvis-integration-developer/SKILL.md`

Whenever you or an AI agent needs to add a new integration, activate the skill and follow its 15-stage checklist. It contains the complete self-contained answers to all 13 core fundamentals, directory conventions, and verification steps.



