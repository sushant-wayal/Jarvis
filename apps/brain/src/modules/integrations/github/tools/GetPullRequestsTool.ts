import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubPullRequestSummary } from '../GitHubClient';

export class GetPullRequestsTool extends BaseIntegrationTool<
  { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; limit?: number },
  GitHubPullRequestSummary[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_pull_requests',
      name: 'github.get_pull_requests',
      description: 'List pull requests in a GitHub repository',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).default('open').describe('Pull request state filter'),
        limit: z.coerce.number().min(1).max(30).default(10).describe('Maximum number of PRs to return'),
      }),
      executor: async (input) => {
        const prs = await client.getPullRequests(
          input.owner,
          input.repo,
          input.state || 'open',
          input.limit || 10
        );
        return {
          success: true,
          data: prs,
          message: `Found ${prs.length} ${input.state || 'open'} pull requests in ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
