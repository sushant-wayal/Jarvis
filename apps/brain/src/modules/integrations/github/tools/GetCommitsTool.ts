import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubCommitSummary } from '../GitHubClient';

export class GetCommitsTool extends BaseIntegrationTool<
  { owner: string; repo: string; limit?: number },
  GitHubCommitSummary[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_commits',
      name: 'github.get_commits',
      description: 'List recent commits for a repository',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        limit: z.number().min(1).max(30).default(10).describe('Maximum number of commits to return'),
      }),
      executor: async (input) => {
        const commits = await client.getCommits(input.owner, input.repo, input.limit || 10);
        return {
          success: true,
          data: commits,
          message: `Retrieved ${commits.length} recent commits for ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
