import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubMergeResult } from '../GitHubClient';

export class MergeBranchTool extends BaseIntegrationTool<
  {
    owner: string;
    repo: string;
    base: string;
    head: string;
    commitMessage?: string;
  },
  GitHubMergeResult
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.merge_branch',
      name: 'github.merge_branch',
      description:
        'Merge a Git branch into another branch directly in a GitHub repository (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        base: z
          .string()
          .min(1)
          .describe(
            'The name of the base branch that changes will be merged into (e.g. "main" or "staging")'
          ),
        head: z
          .string()
          .min(1)
          .describe(
            'The name of the branch or commit SHA to merge into the base branch (e.g. "feat/new-ui")'
          ),
        commitMessage: z
          .string()
          .optional()
          .describe('Optional custom commit message for the merge commit'),
      }),
      executor: async (input) => {
        const result = await client.mergeBranch(
          input.owner,
          input.repo,
          input.base,
          input.head,
          input.commitMessage
        );
        return {
          success: true,
          data: result,
          message: `Successfully merged "${input.head}" into "${input.base}" in ${input.owner}/${input.repo}${
            result.sha ? ` (Merge Commit: ${result.sha.slice(0, 7)})` : ''
          }.`,
        };
      },
    });
  }
}
