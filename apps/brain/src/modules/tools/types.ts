import { IntegrationActionType, ToolCategory, ToolContext, ToolResult, ToolRiskLevel } from '@jarvis/shared';
import { z } from 'zod';

export interface JarvisTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: boolean;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  actionType?: IntegrationActionType;
  integrationId?: string;
  parameters: Record<string, unknown>; // JSON Schema format for Gemini Function Declaration
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}
