import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubPullRequestSummary } from '../GitHubClient';

export class UpdatePullRequestTool extends BaseIntegrationTool<
  {
    owner: string;
    repo: string;
    pullNumber: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    base?: string;
  },
  GitHubPullRequestSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.update_pull_request',
      name: 'github.update_pull_request',
      description:
        'Update an existing pull request (title, description/body, state, or target base branch) in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        pullNumber: z
          .number()
          .int()
          .positive()
          .describe('The pull request number to update (e.g., 42)'),
        title: z.string().min(1).optional().describe('New title for the pull request'),
        body: z
          .string()
          .optional()
          .describe('New description or body content for the pull request'),
        state: z
          .enum(['open', 'closed'])
          .optional()
          .describe('State change: "open" to reopen, or "closed" to close without merging'),
        base: z
          .string()
          .min(1)
          .optional()
          .describe('The name of the branch to change the pull request base branch to'),
      }),
      executor: async (input) => {
        const { owner, repo, pullNumber, ...updates } = input;
        const pr = await client.updatePullRequest(owner, repo, pullNumber, updates);
        return {
          success: true,
          data: pr,
          message: `Successfully updated pull request #${pr.number} "${pr.title}" (State: ${pr.state}) in ${owner}/${repo}. URL: ${pr.url}`,
        };
      },
    });
  }
}
