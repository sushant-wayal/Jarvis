import { integrationManager } from './integration-manager';
import { gitHubIntegration } from './github';
import { serenityIntegration } from './serenity';
import { northIntegration } from './north';
import { gmailIntegration } from './gmail';

export * from './base-integration';
export * from './integration-manager';
export * from './integration-tool';
export * from './types';
export * from './template';
export * from './github';
export * from './serenity';
export * from './north';
export * from './gmail';

/**
 * Register all built-in integrations with the central IntegrationManager.
 */
export function registerDefaultIntegrations(): void {
  integrationManager.register(gitHubIntegration);
  integrationManager.register(serenityIntegration);
  integrationManager.register(northIntegration);
  integrationManager.register(gmailIntegration);
}

// Auto-register default integrations
registerDefaultIntegrations();

