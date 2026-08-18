import { ToolCategory, ToolContext, ToolResult, ToolRiskLevel } from '@jarvis/shared';
import { z } from 'zod';

export interface JarvisTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  parameters: Record<string, unknown>; // JSON Schema format for Gemini Function Declaration
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}
