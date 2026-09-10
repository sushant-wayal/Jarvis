import {
  IntegrationActionType,
  IntegrationAuthConfig,
  IntegrationMetadata,
  IntegrationStatus,
  StandardToolResult,
  ToolCategory,
  ToolContext,
  ToolRiskLevel,
} from '@jarvis/shared';
import { z } from 'zod';
import { JarvisTool } from '../tools/types';

export interface IntegrationTool<TInput = unknown, TOutput = unknown>
  extends JarvisTool<TInput, StandardToolResult<TOutput>> {
  id: string; // Hierarchical ID, e.g. 'github.create_issue'
  name: string;
  integrationId: string;
  actionType: IntegrationActionType;
  requiresConfirmation: boolean;
  permissions?: string[];
  outputSchema?: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
}

export interface JarvisIntegration {
  readonly metadata: IntegrationMetadata;
  isEnabled(): boolean;
  getStatus(): Promise<IntegrationStatus>;
  install?(): Promise<void>;
  initialize(): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  authenticate(credentials: Record<string, string>): Promise<boolean>;
  executeTool?(toolId: string, input: unknown, context: ToolContext): Promise<StandardToolResult>;
  disconnect(): Promise<void>;
  uninstall?(): Promise<void>;
  getTools(): IntegrationTool[];
  getTool(toolId: string): IntegrationTool | undefined;
}
