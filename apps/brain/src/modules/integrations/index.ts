import { integrationManager } from './integration-manager';

export * from './base-integration';
export * from './integration-manager';
export * from './integration-tool';
export * from './types';
export * from './template';

/**
 * Register all built-in integrations with the central IntegrationManager.
 */
export function registerDefaultIntegrations(): void {
  // Built-in integrations are registered here when active.
}

// Auto-register default integrations
registerDefaultIntegrations();

