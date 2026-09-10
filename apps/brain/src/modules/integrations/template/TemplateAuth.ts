import { IntegrationAuthConfig } from '@jarvis/shared';
import { logger } from '@/lib/logging/logger';

export class TemplateAuth {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.TEMPLATE_SERVICE_API_KEY || null;
  }

  public getAuthConfig(): IntegrationAuthConfig {
    return {
      type: 'API_KEY',
      requiredFields: ['apiKey'],
      isConfigured: Boolean(this.apiKey),
      metadata: {
        isEnvConfigured: Boolean(process.env.TEMPLATE_SERVICE_API_KEY),
      },
    };
  }

  public getApiKey(): string | null {
    return this.apiKey;
  }

  public setApiKey(apiKey: string): void {
    if (!apiKey) throw new Error('API key must not be empty.');
    this.apiKey = apiKey.trim();
    logger.info('Template service API key configured.');
  }

  public clearApiKey(): void {
    this.apiKey = null;
    logger.info('Template service API key cleared.');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }
}
