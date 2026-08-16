import { ToolContext, ToolResult } from '@jarvis/shared';
import { z } from 'zod';

export interface JarvisTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema format for Gemini Function Declaration
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}
