# Agent Instructions for Jarvis Workspace

When working on this repository, all AI agents must follow these 25 strictly enforced rules:

1. **Preserve existing functionality.** Never break existing working code without explicit instruction.
2. **Never create unnecessarily large files.** Keep files modular and focused.
3. **Prefer small focused modules.** Target 100-250 lines per file where practical.
4. **Do not duplicate logic.** Extract shared utilities into `packages/shared` or module helpers.
5. **Keep business logic outside UI components.** Store logic in custom hooks or dedicated brain services.
6. **Keep secrets server-side.** Never hardcode or leak secrets to the mobile app or client bundle.
7. **Validate external input.** Always use Zod schemas to validate API inputs and external parameters.
8. **Use TypeScript strictly.** Avoid `any` unless genuinely necessary and documented.
9. **Avoid `any` unless genuinely necessary.** Use exact generics, interfaces, or unknown type boundaries.
10. **Write tests for important business logic.** Verify AI orchestration, tools, memory, and validation.
11. **Run linting after changes.** Ensure zero lint warnings or errors.
12. **Run type checking after changes.** Ensure clean TypeScript build outputs without errors.
13. **Fix ALL lint errors.** Zero tolerance for syntax, style, or import errors.
14. **Fix ALL lint warnings.** Clean all unused variables, implicit types, and warnings.
15. **Do not leave TypeScript errors.** All code must compile cleanly.
16. **Do not leave TODOs for functionality that was explicitly requested.** Implement all specified features completely.
17. **Do not silently remove existing features.**
18. **Keep APIs backward compatible when possible.** Maintain consistent response contracts (`success`, `data`, `error`, `requestId`).
19. **Document architectural decisions.** Keep `docs/` updated as features are added or modified.
20. **Prefer composition over giant components/services.**
21. **Never put the entire Jarvis brain inside a single route handler.** Break handlers into orchestrators, services, memory, tools, and prompts.
22. **Never expose provider API keys to the mobile client.**
23. **Never trust client-provided user IDs without authentication/authorization.**
24. **Do not implement fake functionality just to make a UI appear complete.** Build real working loops.
25. **If a platform limitation prevents a feature, implement the correct abstraction and document the limitation.**
