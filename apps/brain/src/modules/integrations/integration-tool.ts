import {
  IntegrationActionType,
  StandardToolResult,
  ToolCategory,
  ToolContext,
  ToolRiskLevel,
} from '@jarvis/shared';
import { z } from 'zod';
import { logger } from '@/lib/logging/logger';
import { IntegrationTool } from './types';

export interface IntegrationToolOptions<TInput, TOutput> {
  id: string; // e.g. 'github.create_issue'
  name?: string; // e.g. 'github.create_issue'
  description: string;
  integrationId: string;
  category?: ToolCategory;
  riskLevel?: ToolRiskLevel;
  actionType?: IntegrationActionType;
  requiresConfirmation?: boolean;
  permissions?: string[];
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  outputSchema?: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
  executor: (input: TInput, context: ToolContext) => Promise<StandardToolResult<TOutput>>;
}

export class BaseIntegrationTool<TInput = unknown, TOutput = unknown>
  implements IntegrationTool<TInput, TOutput>
{
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly integrationId: string;
  public readonly category: ToolCategory;
  public readonly riskLevel: ToolRiskLevel;
  public readonly actionType: IntegrationActionType;
  public readonly requiresConfirmation: boolean;
  public readonly permissions: string[];
  public readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  public readonly outputSchema?: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
  private readonly executor: (input: TInput, context: ToolContext) => Promise<StandardToolResult<TOutput>>;

  constructor(options: IntegrationToolOptions<TInput, TOutput>) {
    this.id = options.id;
    this.name = options.name || options.id;
    this.description = options.description;
    this.integrationId = options.integrationId;
    this.category = options.category || 'PRODUCTIVITY';
    this.actionType = options.actionType || 'READ';
    this.permissions = options.permissions || [];
    this.riskLevel =
      options.riskLevel ||
      (this.actionType === 'DESTRUCTIVE'
        ? 'CRITICAL'
        : this.actionType === 'WRITE' || this.actionType === 'EXTERNAL_ACTION'
        ? 'HIGH_RISK'
        : 'SAFE');
    this.requiresConfirmation =
      options.requiresConfirmation !== undefined
        ? options.requiresConfirmation
        : this.actionType === 'DESTRUCTIVE' ||
          (this.actionType === 'WRITE' && this.riskLevel === 'HIGH_RISK');
    this.inputSchema = options.inputSchema;
    this.outputSchema = options.outputSchema;
    this.executor = options.executor;
  }

  public async execute(input: TInput, context: ToolContext): Promise<StandardToolResult<TOutput>> {
    const startTime = Date.now();
    try {
      // 1. Machine-readable parameter validation
      let validatedInput = input;
      if (this.inputSchema) {
        const parseResult = this.inputSchema.safeParse(input);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.issues
            .map((i) => `${i.path.join('.') || 'param'}: ${i.message}`)
            .join('; ');
          return {
            success: false,
            data: null,
            message: `Invalid parameters for ${this.name}: ${errorMsg}`,
            error: {
              code: 'INVALID_PARAMETERS',
              message: errorMsg,
              details: parseResult.error.issues,
            },
          };
        }
        validatedInput = parseResult.data;
      }

      logger.info(`Executing integration tool: ${this.id}`, {
        integrationId: this.integrationId,
        toolId: this.id,
        conversationId: context.conversationId,
      });

      const result = await this.executor(validatedInput, context);

      logger.info(`Integration tool succeeded: ${this.id}`, {
        integrationId: this.integrationId,
        toolId: this.id,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error(`Integration tool failed: ${this.id}`, err, {
        integrationId: this.integrationId,
        toolId: this.id,
        durationMs,
      });

      return {
        success: false,
        data: null,
        message: `Error executing ${this.name}: ${errorMsg}`,
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMsg,
          details: err,
        },
      };
    }
  }
}
