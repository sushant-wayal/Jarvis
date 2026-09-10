import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubPullRequestSummary } from '../GitHubClient';

export class CreatePullRequestTool extends BaseIntegrationTool<
  { owner: string; repo: string; title: string; head: string; base: string; body?: string },
  GitHubPullRequestSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.create_pull_request',
      name: 'github.create_pull_request',
      description: 'Create a new pull request in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        title: z.string().min(1).describe('Pull request title'),
        head: z.string().min(1).describe('The name of the branch where your changes are implemented'),
        base: z.string().min(1).describe('The name of the branch you want the changes pulled into'),
        body: z.string().optional().describe('Pull request description/body'),
      }),
      executor: async (input) => {
        const pr = await client.createPullRequest(
          input.owner,
          input.repo,
          input.title,
          input.head,
          input.base,
          input.body
        );
        return {
          success: true,
          data: pr,
          message: `Successfully created pull request #${pr.number} "${pr.title}" in ${input.owner}/${input.repo}. URL: ${pr.url}`,
        };
      },
    });
  }
}
