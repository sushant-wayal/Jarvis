import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubIssueSummary } from '../GitHubClient';

export class GetIssuesTool extends BaseIntegrationTool<
  { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; limit?: number },
  GitHubIssueSummary[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_issues',
      name: 'github.get_issues',
      description: 'List issues in a specific GitHub repository',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).default('open').describe('Issue state filter'),
        limit: z.number().min(1).max(30).default(10).describe('Maximum number of issues to return'),
      }),
      executor: async (input) => {
        const issues = await client.getIssues(
          input.owner,
          input.repo,
          input.state || 'open',
          input.limit || 10
        );
        return {
          success: true,
          data: issues,
          message: `Found ${issues.length} ${input.state || 'open'} issues in ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
