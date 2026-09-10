import { integrationManager } from './integration-manager';
import { gitHubIntegration } from './github';

export * from './base-integration';
export * from './integration-manager';
export * from './integration-tool';
export * from './types';
export * from './template';
export * from './github';

/**
 * Register all built-in integrations with the central IntegrationManager.
 */
export function registerDefaultIntegrations(): void {
  integrationManager.register(gitHubIntegration);
}

// Auto-register default integrations
registerDefaultIntegrations();

