import { ToolContext, ToolResult } from '@jarvis/shared';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import { integrationManager } from '../integrations';
import { calculatorTool } from './calculator';
import { currentTimeTool } from './current-time';
import { dateTimeTool } from './date-time';
import {
  createEventReminderTool,
  createEventTool,
  deleteEventReminderTool,
  deleteEventTool,
  deletePlaceTool,
  listEventRemindersTool,
  listEventsTool,
  listPlacesTool,
  locationGetTool,
  placeSaveTool,
  updateEventReminderTool,
  updateEventTool,
} from './event-tools';
import {
  createMemoryTool,
  deleteMemoryTool,
  listMemoriesTool,
  searchMemoryTool,
  updateMemoryTool,
} from './memory-tools';
import {
  createTaskTool,
  listTasksTool,
  updateTaskTool,
  completeTaskTool,
  deleteTaskTool,
} from './task-tools';
import { getUserProfileTool, updateUserProfileTool } from './user-tools';
import { JarvisTool, RegisteredTool } from './types';
import { weatherTool } from './weather';
import { webSearchTool } from './web-search';
import { phoneTools } from './phone-tools';
import { delegateSubTaskTool } from './sub-agent-tool';

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    // V1 Core Tools
    this.register(calculatorTool as unknown as JarvisTool);
    this.register(currentTimeTool as unknown as JarvisTool);
    this.register(dateTimeTool as unknown as JarvisTool);
    this.register(weatherTool as unknown as JarvisTool);
    this.register(webSearchTool as unknown as JarvisTool);

    // V2 Core Tasks & Reminders (Full Lifecycle)
    this.register(createTaskTool as unknown as JarvisTool);
    this.register(listTasksTool as unknown as JarvisTool);
    this.register(updateTaskTool as unknown as JarvisTool);
    this.register(completeTaskTool as unknown as JarvisTool);
    this.register(deleteTaskTool as unknown as JarvisTool);

    // V2 Core Long-Term Memories & Preferences (Full Lifecycle)
    this.register(createMemoryTool as unknown as JarvisTool);
    this.register(searchMemoryTool as unknown as JarvisTool);
    this.register(listMemoriesTool as unknown as JarvisTool);
    this.register(updateMemoryTool as unknown as JarvisTool);
    this.register(deleteMemoryTool as unknown as JarvisTool);

    // V2 Events, Trips, Plans & Locations (Full Lifecycle)
    this.register(createEventTool as unknown as JarvisTool);
    this.register(listEventsTool as unknown as JarvisTool);
    this.register(updateEventTool as unknown as JarvisTool);
    this.register(deleteEventTool as unknown as JarvisTool);
    this.register(createEventReminderTool as unknown as JarvisTool);
    this.register(listEventRemindersTool as unknown as JarvisTool);
    this.register(updateEventReminderTool as unknown as JarvisTool);
    this.register(deleteEventReminderTool as unknown as JarvisTool);
    this.register(placeSaveTool as unknown as JarvisTool);
    this.register(listPlacesTool as unknown as JarvisTool);
    this.register(deletePlaceTool as unknown as JarvisTool);
    this.register(locationGetTool as unknown as JarvisTool);

    // V2 User Profile & Preference Settings
    this.register(getUserProfileTool as unknown as JarvisTool);
    this.register(updateUserProfileTool as unknown as JarvisTool);

    // V3 Phone Integration Layer
    for (const tool of phoneTools) {
      this.register(tool as unknown as JarvisTool);
    }

    // Sub-Agent Delegation Tool
    this.register(delegateSubTaskTool as unknown as JarvisTool);
  }

  public register<TInput>(tool: JarvisTool<TInput>): void {
    const registered = this.wrapJarvisTool(tool as unknown as JarvisTool);
    this.tools.set(tool.name, registered);
  }

  public getTool(name: string): RegisteredTool | undefined {
    // 1. Direct match in core tools
    const core = this.tools.get(name);
    if (core) return core;

    // 2. Integration Manager dynamic discovery
    const intTool = integrationManager.getTool(name);
    if (intTool) {
      return this.wrapJarvisTool(intTool as unknown as JarvisTool);
    }

    // 3. Fallback normalized dot/underscore match
    const normalizedWithUnderscore = name.replace(/\./g, '_');
    const normalizedWithDot = name.replace(/_/g, '.');
    const fallback = this.tools.get(normalizedWithUnderscore) || this.tools.get(normalizedWithDot);
    if (fallback) return fallback;

    for (const [key, t] of this.tools.entries()) {
      if (key.replace(/\./g, '_') === normalizedWithUnderscore) {
        return t;
      }
    }
    return undefined;
  }

  public getAllTools(): RegisteredTool[] {
    const coreTools = Array.from(this.tools.values());
    const integrationTools = integrationManager
      .getAllActiveTools()
      .map((it) => this.wrapJarvisTool(it as unknown as JarvisTool));
    return [...coreTools, ...integrationTools];
  }

  public getGeminiFunctionDeclarations(options?: {
    excludeTools?: string[];
  }): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    const excludeSet = new Set(
      (options?.excludeTools || []).map((t) => t.replace(/\./g, '_').toLowerCase())
    );

    return this.getAllTools()
      .filter((t) => !excludeSet.has(t.name.replace(/\./g, '_').toLowerCase()))
      .map((t) => ({
        name: t.name.replace(/\./g, '_'),
        description: t.description,
        parameters: t.parameters,
      }));
  }

  private wrapJarvisTool(tool: JarvisTool): RegisteredTool {
    const jsonSchema = this.zodToJsonSchema(tool.inputSchema);
    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      riskLevel: tool.riskLevel,
      requiresConfirmation: Boolean(tool.requiresConfirmation),
      parameters: jsonSchema,
      execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          const validatedInput = tool.inputSchema.parse(input);
          const output = await tool.execute(validatedInput, context);
          const durationMs = Date.now() - startTime;

          // Asynchronously log tool execution to DB
          this.logExecution(context.conversationId, tool.name, validatedInput, output, 'SUCCESS', durationMs);

          return {
            toolName: tool.name,
            success: true,
            output,
            durationMs,
          };
        } catch (err) {
          const durationMs = Date.now() - startTime;
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Tool execution failed: ${tool.name}`, err, { ...context });

          this.logExecution(context.conversationId, tool.name, input, { error: errorMsg }, 'FAILED', durationMs);

          return {
            toolName: tool.name,
            success: false,
            output: null,
            error: errorMsg,
            durationMs,
          };
        }
      },
    };
  }

  private zodToJsonSchema(schema: unknown): Record<string, unknown> {
    const shape = (schema as { shape?: Record<string, { _def: { description?: string; typeName?: string } }> }).shape;
    if (!shape) {
      return { type: 'OBJECT', properties: {} };
    }

    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const def = (value as unknown as { _def: { description?: string; typeName?: string; innerType?: { _def: { typeName?: string } } } })._def;
      const typeName = def.typeName || (def.innerType ? def.innerType._def.typeName : 'ZodString');
      let typeStr = 'STRING';
      if (typeName === 'ZodNumber') typeStr = 'NUMBER';
      if (typeName === 'ZodBoolean') typeStr = 'BOOLEAN';

      properties[key] = {
        type: typeStr,
        description: def.description || key,
      };

      if (typeName !== 'ZodOptional' && typeName !== 'ZodDefault') {
        required.push(key);
      }
    }

    return {
      type: 'OBJECT',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private async logExecution(
    conversationId: string,
    toolName: string,
    input: unknown,
    output: unknown,
    status: 'SUCCESS' | 'FAILED',
    durationMs: number
  ): Promise<void> {
    if (!conversationId) return;
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) return;

      await prisma.toolExecution.create({
        data: {
          conversationId,
          toolName,
          input: JSON.stringify(input),
          output: JSON.stringify(output),
          status,
          durationMs,
        },
      });
    } catch (e) {
      logger.warn('Failed to record tool execution log to database', { error: String(e) });
    }
  }
}

export const toolRegistry = new ToolRegistry();
