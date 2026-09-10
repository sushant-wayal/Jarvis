import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubRepoSummary } from '../GitHubClient';

export class GetRepositoryTool extends BaseIntegrationTool<
  { owner: string; repo: string },
  GitHubRepoSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_repository',
      name: 'github.get_repository',
      description: 'Get detailed information about a specific GitHub repository',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
      }),
      executor: async (input) => {
        const repo = await client.getRepository(input.owner, input.repo);
        return {
          success: true,
          data: repo,
          message: `Repository ${repo.fullName}: ${repo.stars} stars, ${repo.openIssues} open issues.`,
        };
      },
    });
  }
}
