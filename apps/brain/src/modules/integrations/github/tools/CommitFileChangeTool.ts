import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubCommitResult } from '../GitHubClient';

export class CommitFileChangeTool extends BaseIntegrationTool<
  {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    content: string;
    message: string;
  },
  GitHubCommitResult
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.commit_file_change',
      name: 'github.commit_file_change',
      description:
        'Create or update a file on a specified branch in a GitHub repository with complete, production-ready code (requires user confirmation)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        branch: z
          .string()
          .min(1)
          .describe(
            'The target branch where changes are committed (e.g. "feat/header-fix"). MUST NOT be main or master directly.'
          ),
        path: z
          .string()
          .min(1)
          .describe(
            'The relative file path inside the repository (e.g., "src/components/Header.tsx")'
          ),
        content: z
          .string()
          .describe(
            'The complete, production-ready file content to commit. Must be fully implemented with no placeholders, stubs, or truncated code.'
          ),
        message: z
          .string()
          .min(1)
          .describe(
            'Descriptive Git commit message explaining the change (e.g., "feat: implement user settings toggle")'
          ),
      }),
      executor: async (input) => {
        const result = await client.commitFileChange(
          input.owner,
          input.repo,
          input.path,
          input.content,
          input.message,
          input.branch
        );
        return {
          success: true,
          data: result,
          message: `Successfully committed changes to "${result.path}" on branch "${result.branch}" in ${input.owner}/${input.repo} (Commit SHA: ${result.commitSha.slice(0, 7)}).`,
        };
      },
    });
  }
}
