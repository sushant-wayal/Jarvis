# Jarvis V2 Security & Safety Guardrails

## 1. Safety Principles

### Server-Only Secrets
* Provider API keys (Google Gemini, database connection strings) reside strictly in server-side environment variables and are never bundled with mobile client code.

### Tool Permission & Risk Classification
All tools declare strict risk levels:
* `SAFE`: Read-only queries (`calculator`, `date_time`, `weather`, `task_list`, `memory_search`).
* `LOW_RISK`: Reversible modifications (`task_create`, `memory_create`).
* `HIGH_RISK` / `CRITICAL`: External communications, deletions, side effects. Trigger the interactive **ConfirmationModal** on the mobile UI before execution.

### Prompt Injection Defense
* Tool results and external web search outputs are treated as untrusted data strings.
* System instructions and user preferences are isolated in native GenAI `systemInstruction` parameters to prevent override.

### Agent Loop Guardrails
* Maximum steps: 12
* Maximum tool calls: 10
* Maximum retries: 2
