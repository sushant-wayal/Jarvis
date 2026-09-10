import { ToolCategory, ToolRiskLevel } from './index';

export type IntegrationStatus = 'ENABLED' | 'DISABLED' | 'CONFIG_REQUIRED' | 'ERROR';

export type IntegrationAuthType = 'API_KEY' | 'OAUTH' | 'TOKEN' | 'BASIC' | 'NONE' | 'CUSTOM';

export type IntegrationActionType = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'EXTERNAL_ACTION';

export interface IntegrationAuthConfig {
  type: IntegrationAuthType;
  requiredFields: string[];
  isConfigured: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntegrationMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  icon?: string;
  docUrl?: string;
  authRequirements: IntegrationAuthConfig;
  permissions: string[];
  eventCapabilities?: string[];
}

export interface ToolErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface StandardToolResult<T = unknown> {
  success: boolean;
  data: T | null;
  message?: string;
  error?: ToolErrorDetail;
  metadata?: Record<string, unknown>;
  requiresUserAction?: boolean;
}

export interface IntegrationToolDefinition {
  id: string;
  name: string;
  description: string;
  integrationId: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  actionType: IntegrationActionType;
  requiresConfirmation: boolean;
  permissions?: string[];
}

