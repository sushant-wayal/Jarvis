import { logger } from '@/lib/logging/logger';
import { TemplateAuth } from './TemplateAuth';

export class TemplateClient {
  private auth: TemplateAuth;
  private baseUrl: string;

  constructor(auth?: TemplateAuth | string, baseUrl?: string) {
    if (typeof auth === 'string') {
      this.auth = new TemplateAuth();
      this.auth.setApiKey(auth);
    } else {
      this.auth = auth || new TemplateAuth();
    }
    this.baseUrl = baseUrl || 'https://api.example.com/v1';
  }

  public getAuth(): TemplateAuth {
    return this.auth;
  }

  public async getResource(id: string): Promise<Record<string, unknown>> {
    if (!this.auth.isConfigured()) {
      throw new Error('Service is not configured. API key is required.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/resources/${id}`, {
        headers: {
          Authorization: `Bearer ${this.auth.getApiKey()}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication expired or invalid. Please re-authenticate.');
        }
        if (response.status === 404) {
          throw new Error(`Resource ${id} not found.`);
        }
        throw new Error(`Service error: HTTP ${response.status}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (err) {
      logger.error('Service request failed', err, { id });
      throw err;
    }
  }

  public async createResource(name: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.auth.isConfigured()) {
      throw new Error('Service is not configured. API key is required.');
    }

    const response = await fetch(`${this.baseUrl}/resources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.auth.getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create resource: HTTP ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
