import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubMergeResult } from '../GitHubClient';

export class MergePullRequestTool extends BaseIntegrationTool<
  {
    owner: string;
    repo: string;
    pullNumber: number;
    commitTitle?: string;
    commitMessage?: string;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
  },
  GitHubMergeResult
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.merge_pull_request',
      name: 'github.merge_pull_request',
      description:
        'Accept and merge a pull request into its base branch in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        pullNumber: z
          .coerce.number()
          .int()
          .positive()
          .describe('The pull request number to merge and accept (e.g., 42)'),
        commitTitle: z
          .string()
          .optional()
          .describe('Title for the automatic commit message'),
        commitMessage: z
          .string()
          .optional()
          .describe('Extra details to append to the automatic commit message'),
        mergeMethod: z
          .enum(['merge', 'squash', 'rebase'])
          .default('merge')
          .describe('The merge method to use: "merge", "squash", or "rebase"'),
      }),
      executor: async (input) => {
        const result = await client.mergePullRequest(
          input.owner,
          input.repo,
          input.pullNumber,
          {
            commitTitle: input.commitTitle,
            commitMessage: input.commitMessage,
            mergeMethod: input.mergeMethod,
          }
        );
        return {
          success: true,
          data: result,
          message: `Successfully merged and accepted pull request #${input.pullNumber} in ${input.owner}/${input.repo}${
            result.sha ? ` (Merge Commit: ${result.sha.slice(0, 7)})` : ''
          }.`,
        };
      },
    });
  }
}
