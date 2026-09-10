import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubRepoSummary } from '../GitHubClient';

export class GetRepositoriesTool extends BaseIntegrationTool<
  { limit?: number },
  GitHubRepoSummary[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_repositories',
      name: 'github.get_repositories',
      description: 'List repositories for the authenticated user or public repositories',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        limit: z.number().min(1).max(30).default(10).describe('Maximum number of repositories to return'),
      }),
      executor: async (input) => {
        const repos = await client.getRepositories(input.limit || 10);
        return {
          success: true,
          data: repos,
          message: `Retrieved ${repos.length} GitHub repositories.`,
        };
      },
    });
  }
}
