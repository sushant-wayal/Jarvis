import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubBranchSummary, GitHubClient } from '../GitHubClient';

export class CreateBranchTool extends BaseIntegrationTool<
  { owner: string; repo: string; branch: string; baseBranch?: string },
  GitHubBranchSummary
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.create_branch',
      name: 'github.create_branch',
      description:
        'Create a new Git branch in a GitHub repository to prepare for code changes',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: false,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        branch: z
          .string()
          .min(1)
          .describe(
            'The name of the new branch to create (e.g., "feat/user-auth", "fix/navbar-bug")'
          ),
        baseBranch: z
          .string()
          .optional()
          .describe(
            'The base branch to branch off from. Defaults to repository default branch (e.g. "main")'
          ),
      }),
      executor: async (input) => {
        const branch = await client.createBranch(
          input.owner,
          input.repo,
          input.branch,
          input.baseBranch
        );
        return {
          success: true,
          data: branch,
          message: `Successfully created branch "${branch.name}" in ${input.owner}/${input.repo} from ${
            input.baseBranch || 'default branch'
          } (SHA: ${branch.sha.slice(0, 7)}).`,
        };
      },
    });
  }
}
