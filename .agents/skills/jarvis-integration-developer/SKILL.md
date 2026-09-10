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
5. **Human Confirmation for Side Effects (Workspace Rule 12)**:
   Actions that write external data, send messages, or perform destructive actions must declare `actionType: 'WRITE' | 'EXTERNAL_ACTION' | 'DESTRUCTIVE'`, `riskLevel: 'HIGH_RISK'`, and `requiresConfirmation: true`.

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
   - Manages token/key storage, retrieval, and validation against external endpoints.
   - Securely accesses `process.env.<SERVICE>_TOKEN` or dynamic runtime credentials.
   - Provides `getAuthConfig()` returning `IntegrationAuthConfig`.
   - Never leaks tokens to Gemini, logs, or mobile clients.

2. **`<ServiceName>Client.ts`**:
   - Injects `<ServiceName>Auth`.
   - Executes standard `fetch()` or SDK calls against external endpoints.
   - Translates HTTP status codes (401, 403, 404, 422, 429) into clear, friendly error messages.

3. **`tools/<Action>Tool.ts`**:
   - Extends `BaseIntegrationTool<TInput, TOutput>`.
   - Declares hierarchical `id` (`<service>.<action>`), `name`, `description`, `category`, `actionType`, and `riskLevel`.
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

1. **What an integration is**: An external application/service plugin (e.g., GitHub, Spotify) encapsulated in a class extending `BaseIntegration`. It manages credentials, client lifecycle, status, and registers a suite of tools with Jarvis.
2. **What a tool is**: A discrete, executable unit of capability extending `BaseIntegrationTool`. It declares a hierarchical ID (`<service>.<action>`), human description, Zod `inputSchema`, permission risk level, confirmation flags, and an async `executor()`.
3. **How tools are registered**: Tools are instantiated inside `<ServiceName>Integration.registerTools()` and registered to the integration via `this.registerTool(new ToolClass(this.client))`. The integration itself is registered with the central `integrationManager.register(integration)`.
4. **How Gemini discovers tools**: `toolRegistry.getAllTools()` aggregates core built-in tools with `integrationManager.getAllActiveTools()`. `toolRegistry.getGeminiFunctionDeclarations()` converts them to Gemini-compatible declarations (replacing dots with underscores, e.g. `github_create_issue`).
5. **How authentication works**: Authentication is completely modularized in `<ServiceName>Auth.ts`. Credentials are kept server-side (read from environment variables or dynamic tokens) and validated against the service's verification endpoint (e.g. `/user` or `/me`). Secrets are never leaked to logs, client bundles, or LLM prompts.
6. **How permissions work**: Tools specify `actionType` (`READ`, `WRITE`, `DESTRUCTIVE`, `EXTERNAL_ACTION`), `riskLevel` (`SAFE`, `LOW_RISK`, `HIGH_RISK`, `CRITICAL`), and `requiresConfirmation: boolean`. Destructive or external write actions (e.g., creating issues, posting messages) require confirmation before running.
7. **How results are returned**: All tool executions return a normalized `StandardToolResult<T>` containing `success`, concise structured `data` for LLM reasoning, a friendly `message`, and optional `error` details. Raw JSON dumps from external APIs are never returned directly to the LLM.
8. **How errors are handled**: Tool executors and clients translate HTTP status codes (401, 403, 404, 422, 429) and timeouts into understandable messages. Input parameters are validated with Zod, returning `INVALID_PARAMETERS` if malformed. Unconfigured integrations return `CONFIG_REQUIRED` or `TOOL_UNAVAILABLE`.
9. **How integrations are enabled/disabled**: Via `integrationManager.enableIntegration(id)` and `disableIntegration(id)`. When disabled, the integration's tools are immediately excluded from `getAllActiveTools()` and Gemini function declarations.
10. **How to test an integration**: By writing unit tests with Vitest in `apps/brain/src/__tests__/`. Tests must verify: lifecycle registration, dynamic discovery/hiding on disable, input parameter validation, error mapping (401, 403, timeouts), mock execution of read and write tools, and confirmation requirements.
11. **Where integration code should live**: Exclusively inside `apps/brain/src/modules/integrations/<service-name>/`.
12. **What files/classes/interfaces need to be created**:
    - `<ServiceName>Auth.ts` (Class managing credentials)
    - `<ServiceName>Client.ts` (Class wrapping HTTP/REST endpoints)
    - `<ServiceName>Integration.ts` (Class extending `BaseIntegration`)
    - `tools/<Action>Tool.ts` (Individual classes extending `BaseIntegrationTool`, one per file)
    - `index.ts` (Barrel export)
13. **What existing APIs should be reused**:
    - Shared types from `@jarvis/shared` (`IntegrationMetadata`, `StandardToolResult`, `ToolContext`, `ToolRiskLevel`).
    - Base abstractions from `apps/brain/src/modules/integrations/` (`BaseIntegration`, `BaseIntegrationTool`, `integrationManager`).
    - Unified logger from `src/lib/logging/logger`.
    - Native Jarvis reminder tools (`task_create`, `event_reminder_create`) for scheduling rather than duplicating time logic.

---

## 4. Standard Contracts & Interfaces

All shared interfaces live in `@jarvis/shared`:

### `IntegrationMetadata`
```typescript
export interface IntegrationMetadata {
  id: string;                    // e.g. 'spotify', 'slack'
  name: string;                  // e.g. 'Spotify', 'Slack'
  description: string;           // Brief human & agent summary
  version: string;               // SemVer, e.g. '1.0.0'
  authRequirements: {
    type: 'API_KEY' | 'OAUTH' | 'TOKEN' | 'BASIC' | 'NONE' | 'CUSTOM';
    requiredFields: string[];    // e.g. ['clientId', 'clientSecret']
    isConfigured: boolean;
  };
  permissions: string[];         // e.g. ['playlist:read', 'playback:control']
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

## 5. Step-by-Step 14-Stage Implementation Checklist

```text
[ ] Stage 1:  Research External API & Documentation
              • Identify authentication model (OAuth2, Bearer Token, API Key).
              • Determine key endpoints, rate limits, and JSON schemas.
[ ] Stage 2:  Create <ServiceName>Auth.ts
              • Implement token storage, retrieval, validation, and status checks.
              • NEVER hardcode credentials or log sensitive tokens.
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
[ ] Stage 7:  Configure Action Types & Confirmation
              • Set `actionType`: 'READ' (safe) or 'WRITE' / 'EXTERNAL_ACTION' (requiresConfirmation: true, HIGH_RISK).
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
[ ] Stage 12: Verify Dynamic Tool Discovery
              • Ensure `toolRegistry.getAllTools()` and `toolRegistry.getGeminiFunctionDeclarations()` include the new tools.
[ ] Stage 13: Write Unit Tests
              • Add unit tests in `apps/brain/src/__tests__/`.
[ ] Stage 14: Document Integration
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
