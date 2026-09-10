import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubIssueSummary } from '../GitHubClient';

export class CreateIssueTool extends BaseIntegrationTool<
  { owner: string; repo: string; title: string; body?: string; labels?: string[] },
  GitHubIssueSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.create_issue',
      name: 'github.create_issue',
      description: 'Create a new issue in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        title: z.string().min(1).describe('Issue title'),
        body: z.string().optional().describe('Detailed description or body of the issue'),
        labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
      }),
      executor: async (input) => {
        const issue = await client.createIssue(
          input.owner,
          input.repo,
          input.title,
          input.body,
          input.labels
        );
        return {
          success: true,
          data: issue,
          message: `Successfully created issue #${issue.number} "${issue.title}" in ${input.owner}/${input.repo}. URL: ${issue.url}`,
        };
      },
    });
  }
}
