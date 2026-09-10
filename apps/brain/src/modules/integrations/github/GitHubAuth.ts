import { IntegrationAuthConfig } from '@jarvis/shared';
import { logger } from '@/lib/logging/logger';

export class GitHubAuth {
  private token: string | null = null;

  constructor() {
    this.token = process.env.GITHUB_TOKEN || null;
  }

  public getAuthConfig(): IntegrationAuthConfig {
    return {
      type: 'TOKEN',
      requiredFields: ['token'],
      isConfigured: Boolean(this.token),
      metadata: {
        tokenConfigured: Boolean(this.token),
        tokenSource: this.token === process.env.GITHUB_TOKEN ? 'ENV' : 'DYNAMIC',
      },
    };
  }

  public getToken(): string | null {
    return this.token;
  }

  public setToken(token: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid GitHub token provided.');
    }
    this.token = token.trim();
    logger.info('GitHub authentication token configured successfully.');
  }

  public clearToken(): void {
    this.token = null;
    logger.info('GitHub authentication token cleared.');
  }

  public isConfigured(): boolean {
    return Boolean(this.token && this.token.length > 0);
  }

  /**
   * Validate current token against the GitHub API /user endpoint.
   */
  public async validateToken(): Promise<{ valid: boolean; username?: string; error?: string }> {
    if (!this.token) {
      return { valid: false, error: 'No GitHub token configured.' };
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'Jarvis-Assistant/2.0',
        },
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `GitHub token verification failed: HTTP ${response.status} ${response.statusText}`,
        };
      }

      const user = (await response.json()) as { login?: string };
      return {
        valid: true,
        username: user.login,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        error: `Network error verifying GitHub token: ${msg}`,
      };
    }
  }
}
