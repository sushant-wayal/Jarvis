import { IntegrationAuthConfig } from '@jarvis/shared';
import { logger } from '@/lib/logging/logger';

export class SerenityAuth {
  private apiKey: string | null = null;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.SERENITY_API_KEY || null;
    this.baseUrl = (process.env.SERENITY_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  }

  public getAuthConfig(): IntegrationAuthConfig {
    return {
      type: 'API_KEY',
      requiredFields: ['apiKey'],
      isConfigured: Boolean(this.apiKey && this.apiKey.length > 0),
      metadata: {
        keyConfigured: Boolean(this.apiKey && this.apiKey.length > 0),
        baseUrl: this.baseUrl,
        keySource: this.apiKey === process.env.SERENITY_API_KEY ? 'ENV' : 'DYNAMIC',
      },
    };
  }

  public getApiKey(): string | null {
    return this.apiKey;
  }

  public setApiKey(apiKey: string): void {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid Serenity API key provided.');
    }
    this.apiKey = apiKey.trim();
    logger.info('Serenity authentication API key configured successfully.');
  }

  public clearApiKey(): void {
    this.apiKey = null;
    logger.info('Serenity authentication API key cleared.');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid Serenity base URL provided.');
    }
    this.baseUrl = url.trim().replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Validate current credentials against the Serenity service /api/settings endpoint.
   */
  public async validateAuth(): Promise<{ valid: boolean; message?: string; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'No Serenity API key configured.' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.baseUrl}/api/settings`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-jarvis-key': this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          valid: false,
          error: `Serenity credential verification failed: HTTP ${response.status} ${response.statusText}`,
        };
      }

      return {
        valid: true,
        message: 'Successfully authenticated with Serenity pipeline service.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: `Network error verifying Serenity credentials: ${msg}`,
      };
    }
  }
}
