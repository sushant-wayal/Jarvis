import { IntegrationAuthConfig } from '@jarvis/shared';
import { logger } from '@/lib/logging/logger';

export class NorthAuth {
  private apiKey: string | null = null;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.NORTH_API_KEY || process.env.NORTH_CRON_SECRET || null;
    this.baseUrl = (process.env.NORTH_BASE_URL || 'https://movenorth.vercel.app').replace(/\/+$/, '');
  }

  public getAuthConfig(): IntegrationAuthConfig {
    return {
      type: 'API_KEY',
      requiredFields: ['baseUrl'],
      isConfigured: this.isConfigured(),
      metadata: {
        baseUrl: this.baseUrl,
        hasApiKey: Boolean(this.apiKey && this.apiKey.length > 0),
        isEnvConfigured: Boolean(process.env.NORTH_BASE_URL || process.env.NORTH_API_KEY),
      },
    };
  }

  public getApiKey(): string | null {
    return this.apiKey;
  }

  public setApiKey(apiKey: string): void {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid North API key provided.');
    }
    this.apiKey = apiKey.trim();
    logger.info('North financial advisor API key configured successfully.');
  }

  public clearApiKey(): void {
    this.apiKey = null;
    logger.info('North financial advisor API key cleared.');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid North base URL provided.');
    }
    this.baseUrl = url.trim().replace(/\/+$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.length > 0);
  }

  /**
   * Validate connection to North financial advisor service.
   */
  public async validateAuth(): Promise<{ valid: boolean; message?: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/api/dashboard/overview`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        return {
          valid: false,
          error: `North service verification failed: HTTP ${response.status} ${response.statusText}`,
        };
      }

      return {
        valid: true,
        message: 'Successfully connected to North Personal Financial Advisor service.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: `Network error verifying North connection: ${msg}`,
      };
    }
  }
}
