---
name: jarvis-integration-developer
description: Standardized engineering workflow, file system architecture, and checklist for integrating any external app or service into the Jarvis Tool & Integration Framework (e.g., Spotify, Slack, Notion, Home Assistant).
---

# Jarvis Integration Developer Skill

This skill provides a standardized, repeatable procedure for integrating external applications and services into Jarvis.

Whenever you need to add a new external service (e.g. Spotify, Slack, Notion, Home Assistant, Linear, Jira, Discord), **follow this skill strictly**.

---

## 1. Core Architectural Principles

1. **Jarvis Core is Service-Agnostic**:
   Jarvis Core and the Gemini LLM only know about standard Tools (`id`, `inputSchema`, `execute()`). They do NOT know about external endpoints, headers, JSON formats, or SDKs.
2. **Registry & Dynamic Discovery**:
   External services register as `JarvisIntegration` modules with the `integrationManager`. When an integration is enabled, its tools are dynamically exposed to Gemini. When disabled, its tools vanish automatically.
3. **Pure Executor Architecture (Workspace Rules 37-39)**:
   The LLM (Gemini) is the sole semantic engine responsible for entity resolution, query normalization, and parameter extraction. Tool executors must remain pure executors and never perform string slicing, regex stripping, or command heuristics.
4. **No Fake Functionality (Workspace Rule 22)**:
   Never return simulated success when an external action did not execute. If credentials are missing, an API is unreachable, or an action failed, return structured errors indicating setup requirements.
5. **Granular Permissions & Safety Controls (Workspace Rule 12)**:
   Actions that write external data, send messages, or perform destructive actions must declare baseline safety defaults: `actionType: 'READ' | 'WRITE' | 'EXTERNAL_ACTION' | 'DESTRUCTIVE'`, `riskLevel: 'SAFE' | 'LOW_RISK' | 'HIGH_RISK' | 'CRITICAL'`, and `requiresConfirmation: boolean`.
   At runtime, Jarvis enforces a **3-state permission model (`ALLOW` | `ASK` | `DENY`)** configurable both per action category and per individual tool in Settings. User tool-level policies take precedence over action defaults:
   - `ALLOW`: Pre-authorized by user. Tool auto-executes directly without pausing for confirmation in conversation.
   - `ASK`: Interactive human confirmation required. Agent loop pauses with `mode: 'CONFIRMATION'`.
   - `DENY`: Hard-blocked. Execution is rejected immediately, notifying the user that the tool is disabled in settings.

---

## 2. Systematic File System Architecture (MANDATORY)

Every integration **must** strictly adhere to this modular directory structure. Do **not** inline tools or authentication into a single monolithic file.

```text
apps/brain/src/modules/integrations/<service-name>/
├── <ServiceName>Auth.ts         # Dedicated credential lifecycle, token validation, and storage
├── <ServiceName>Client.ts       # HTTP REST / SDK client with error translation
├── <ServiceName>Integration.ts  # Integration lifecycle and tool registration
├── index.ts                     # Clean barrel export of all integration classes and tools
└── tools/                       # DEDICATED directory for tools (ONE class per file)
    ├── <Action1>Tool.ts         # Extends BaseIntegrationTool with Zod schema and executor
    ├── <Action2>Tool.ts
    └── ...
```

### Component Responsibilities:

1. **`<ServiceName>Auth.ts`**:
   - Manages token/key/OAuth credential storage, retrieval, and validation against external endpoints.
   - Securely accesses `process.env.<SERVICE>_TOKEN` or dynamic runtime credentials in user preferences.
   - Supports OAuth2 authorization flows, storing `accessToken`, `refreshToken`, and expiration.
   - Implements automatic token refresh when `refreshToken` is available.
   - Clears credentials upon disconnect; prompts for re-authentication when re-enabled if tokens are missing.
   - Provides `getAuthConfig()` returning `IntegrationAuthConfig`.
   - Never leaks tokens to Gemini, logs, or mobile clients.

2. **`<ServiceName>Client.ts`**:
   - Injects `<ServiceName>Auth`.
   - Executes standard `fetch()` or SDK calls against external endpoints.
   - Translates HTTP status codes (401, 403, 404, 422, 429) into clear, friendly error messages.

3. **`tools/<Action>Tool.ts`**:
   - Extends `BaseIntegrationTool<TInput, TOutput>`.
   - Declares hierarchical `id` (`<service>.<action>`), `name`, `description`, `category`, `actionType`, and `riskLevel`.
   - Uses concise, user-friendly descriptions (under 100 chars) as they are directly displayed in the mobile settings screen.
   - Sets `requiresConfirmation: true` for any write/destructive actions.
   - Declares strongly typed machine-readable `inputSchema` using `z.object({...})`.
   - Returns structured `StandardToolResult<TOutput>`.

4. **`<ServiceName>Integration.ts`**:
   - Extends `BaseIntegration`.
   - Instantiates `<ServiceName>Auth` and `<ServiceName>Client`.
   - Instantiates each tool class and registers it via `this.registerTool(new <Action>Tool(this.client))`.
   - Implements lifecycle methods (`getStatus`, `authenticate`, `disconnect`).

---

## 3. The 13 Fundamentals of Jarvis Integrations (Self-Contained Reference)

Any AI agent or developer implementing an integration must understand these 13 core answers:

1. **What an integration is**: An external application/service plugin (e.g., GitHub, Gmail, Spotify) encapsulated in a class extending `BaseIntegration`. It manages credentials, client lifecycle, status, and registers a suite of tools with Jarvis.
2. **What a tool is**: A discrete, executable unit of capability extending `BaseIntegrationTool`. It declares a hierarchical ID (`<service>.<action>`), human description, Zod `inputSchema`, action type, risk level, confirmation flags, and an async `executor()`.
3. **How tools are registered**: Tools are instantiated inside `<ServiceName>Integration.registerTools()` and registered to the integration via `this.registerTool(new ToolClass(this.client))`. The integration itself is registered with the central `integrationManager.register(integration)`.
4. **How Gemini discovers tools**: `toolRegistry.getAllTools()` aggregates core built-in tools with `integrationManager.getAllActiveTools()`. `toolRegistry.getGeminiFunctionDeclarations()` converts them to Gemini-compatible declarations (replacing dots with underscores, e.g. `github_create_issue`).
5. **How authentication works**: Authentication is completely modularized in `<ServiceName>Auth.ts`. Supports API keys, personal access tokens, and OAuth2.0 flows (e.g. Google OAuth for Gmail with auto-refresh using `refresh_token`). Credentials are kept server-side in encrypted user preferences/credentials and validated against verification endpoints. Disconnecting clears tokens, and re-enabling prompts the user to re-authenticate.
6. **How permissions work**: Tools declare baseline `actionType` (`READ`, `WRITE`, `DESTRUCTIVE`, `EXTERNAL_ACTION`) and `riskLevel` (`SAFE`, `LOW_RISK`, `HIGH_RISK`, `CRITICAL`). Users configure policies (`ALLOW` | `ASK` | `DENY`) in the mobile Integrations settings screen:
   - Configurable per action category (`policies`) and per individual tool (`toolPolicies`).
   - Tool-specific policy takes highest precedence, overriding action-type policies.
   - `ALLOW`: Pre-authorized; executes directly without prompting in chat. Dynamically injected into LLM prompt under `[PRE-AUTHORIZED ACTIONS - DIRECT EXECUTION]`.
   - `ASK`: Halts agent loop with interactive confirmation modal (`mode: 'CONFIRMATION'`).
   - `DENY`: Hard-blocked; planner immediately stops execution with a user notice and LLM is informed under `[DISALLOWED ACTIONS - BLOCKED BY USER]`.
7. **How results are returned**: All tool executions return a normalized `StandardToolResult<T>` containing `success`, concise structured `data` for LLM reasoning, a friendly `message`, and optional `error` details. Raw JSON dumps from external APIs are never returned directly to the LLM.
8. **How errors are handled**: Tool executors and clients translate HTTP status codes (401, 403, 404, 422, 429) and timeouts into understandable messages. Input parameters are validated with Zod, returning `INVALID_PARAMETERS` if malformed. Unconfigured integrations return `CONFIG_REQUIRED` or `TOOL_UNAVAILABLE`.
9. **How integrations are enabled/disabled**: Via `integrationManager.enableIntegration(id)` and `disableIntegration(id)`. When disabled, the integration's tools are immediately excluded from `getAllActiveTools()` and Gemini function declarations.
10. **How to test an integration**: By writing unit tests with Vitest in `apps/brain/src/__tests__/`. Tests must verify: lifecycle registration, dynamic discovery/hiding on disable, input parameter validation, error mapping (401, 403, timeouts), mock execution of read and write tools, and per-tool policy overrides (`ALLOW`, `ASK`, `DENY`).
11. **Where integration code should live**: Exclusively inside `apps/brain/src/modules/integrations/<service-name>/`.
12. **What files/classes/interfaces need to be created**:
    - `<ServiceName>Auth.ts` (Class managing credentials)
    - `<ServiceName>Client.ts` (Class wrapping HTTP/REST endpoints)
    - `<ServiceName>Integration.ts` (Class extending `BaseIntegration`)
    - `tools/<Action>Tool.ts` (Individual classes extending `BaseIntegrationTool`, one per file)
    - `index.ts` (Barrel export)
13. **What existing APIs should be reused**:
    - Shared types from `@jarvis/shared` (`IntegrationMetadata`, `StandardToolResult`, `ToolContext`, `ToolRiskLevel`, `PermissionPolicy`).
    - Base abstractions from `apps/brain/src/modules/integrations/` (`BaseIntegration`, `BaseIntegrationTool`, `integrationManager`).
    - Unified logger from `src/lib/logging/logger`.
    - Native Jarvis reminder tools (`task_create`, `event_reminder_create`) for scheduling rather than duplicating time logic.

---

## 4. Standard Contracts & Interfaces

All shared interfaces live in `@jarvis/shared`:

### `IntegrationMetadata` & Policy Types
```typescript
export type PermissionPolicy = 'ALLOW' | 'ASK' | 'DENY';

export interface IntegrationToolItem {
  id: string;                     // e.g. 'gmail.send_email'
  name: string;                   // e.g. 'Send Email'
  description: string;            // Human-readable tool purpose
  actionType: ToolActionType;     // 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'EXTERNAL_ACTION'
  riskLevel: ToolRiskLevel;       // 'SAFE' | 'LOW_RISK' | 'HIGH_RISK' | 'CRITICAL'
  policy: PermissionPolicy;       // Effective policy ('ALLOW' | 'ASK' | 'DENY')
}

export interface IntegrationMetadata {
  id: string;                    // e.g. 'spotify', 'slack', 'gmail'
  name: string;                  // e.g. 'Spotify', 'Slack', 'Gmail'
  description: string;           // Brief human & agent summary
  version: string;               // SemVer, e.g. '1.0.0'
  authRequirements: {
    type: 'API_KEY' | 'OAUTH' | 'TOKEN' | 'BASIC' | 'NONE' | 'CUSTOM';
    requiredFields: string[];    // e.g. ['clientId', 'clientSecret']
    isConfigured: boolean;
  };
  permissions: string[];         // e.g. ['mail.google.com']
  eventCapabilities?: string[];  // optional webhook/event capabilities
}
```

### `StandardToolResult<T>`
```typescript
export interface StandardToolResult<T = unknown> {
  success: boolean;
  data: T | null;                // Clean structured data for the LLM
  message?: string;              // Human-readable natural summary
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
  requiresUserAction?: boolean;
}
```

---

## 5. Step-by-Step 15-Stage Implementation Checklist

```text
[ ] Stage 1:  Research External API & Documentation
              • Identify authentication model (OAuth2, Bearer Token, API Key).
              • Determine key endpoints, rate limits, and JSON schemas.
[ ] Stage 2:  Create <ServiceName>Auth.ts
              • Implement token/OAuth storage, retrieval, validation, and auto-refresh.
              • NEVER hardcode credentials or log sensitive tokens.
              • Implement clean disconnect (clear credentials) and reconnect prompt.
[ ] Stage 3:  Create <ServiceName>Client.ts
              • Encapsulate all HTTP/SDK operations in a dedicated class.
              • Standardize HTTP error mapping (401 -> re-authenticate, 404 -> not found, 429 -> rate limit).
[ ] Stage 4:  Create Dedicated tools/ Directory
              • Create `apps/brain/src/modules/integrations/<service-name>/tools/`.
[ ] Stage 5:  Implement Individual Tool Classes in tools/
              • Create one file per tool (e.g. `SearchTracksTool.ts`, `CreatePlaylistTool.ts`).
              • Extend `BaseIntegrationTool`.
[ ] Stage 6:  Define Zod Input Schemas
              • Machine-readable types, descriptions, defaults, and optional flags.
[ ] Stage 7:  Configure Action Types & Baseline Risk
              • Set `actionType`: 'READ' (safe) or 'WRITE' / 'EXTERNAL_ACTION' / 'DESTRUCTIVE'.
              • Set `riskLevel` and baseline `requiresConfirmation`.
              • Write concise, clean descriptions for mobile settings display.
[ ] Stage 8:  Implement Tool Executors
              • Return concise, structured `StandardToolResult` data.
              • Never dump enormous raw JSON responses to the LLM.
[ ] Stage 9:  Create <ServiceName>Integration.ts
              • Extend `BaseIntegration`.
              • Instantiate auth and client.
              • Instantiate and register each tool with `this.registerTool(new ToolClass(this.client))`.
[ ] Stage 10: Create index.ts Barrel Export
              • Export auth, client, integration, and all tool classes.
[ ] Stage 11: Auto-Register Integration
              • In `apps/brain/src/modules/integrations/index.ts`, register the instance with `integrationManager`.
[ ] Stage 12: Verify Dynamic Tool Discovery & Introspection
              • Ensure `toolRegistry.getAllTools()` includes the new tools.
              • Ensure `GET /api/v1/integrations` exposes tool list with policies to mobile settings.
[ ] Stage 13: Test Granular Tool Policies
              • Verify tool-level ALLOW auto-executes without confirmation.
              • Verify tool-level ASK triggers interactive confirmation.
              • Verify tool-level DENY blocks execution immediately.
[ ] Stage 14: Write Unit Tests
              • Add unit tests in `apps/brain/src/__tests__/`.
[ ] Stage 15: Document Integration
              • Update `docs/integrations.md` with capabilities, configuration, and sample interactions.
```

---

## 5. Reference Scaffold Template

A complete, working reference template exists in:
[`apps/brain/src/modules/integrations/template/`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/)

- [`TemplateAuth.ts`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/TemplateAuth.ts): Authentication lifecycle pattern.
- [`TemplateClient.ts`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/TemplateClient.ts): REST client with error translation.
- [`tools/ExampleReadTool.ts`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/tools/ExampleReadTool.ts): Safe read tool pattern.
- [`tools/ExampleWriteTool.ts`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/tools/ExampleWriteTool.ts): Confirmed write tool pattern.
- [`TemplateIntegration.ts`](file:///c:/Users/susha/OneDrive/Desktop/jarvis/apps/brain/src/modules/integrations/template/TemplateIntegration.ts): Integration assembly.

---

## 6. Verification Checklist

Always run the following commands after adding an integration:
1. `npm run typecheck --workspace=packages/shared`
2. `npm run build:shared`
3. `npm run typecheck --workspace=apps/brain`
4. `npm run test --workspace=apps/brain`
