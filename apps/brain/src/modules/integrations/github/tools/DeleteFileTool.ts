import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubDeleteResult } from '../GitHubClient';

export class DeleteFileTool extends BaseIntegrationTool<
  {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    message: string;
  },
  GitHubDeleteResult
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.delete_file',
      name: 'github.delete_file',
      description:
        'Delete a file from a specified branch in a GitHub repository (requires user confirmation, DESTRUCTIVE)',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'DESTRUCTIVE',
      riskLevel: 'CRITICAL',
      requiresConfirmation: true,
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        branch: z
          .string()
          .min(1)
          .describe(
            'The target branch where the file will be deleted. MUST NOT be main or master directly.'
          ),
        path: z
          .string()
          .min(1)
          .describe(
            'The relative file path inside the repository to delete (e.g., "src/legacy/oldUtil.ts")'
          ),
        message: z
          .string()
          .min(1)
          .describe(
            'Descriptive Git commit message explaining why the file is being deleted'
          ),
      }),
      executor: async (input) => {
        const result = await client.deleteFile(
          input.owner,
          input.repo,
          input.path,
          input.message,
          input.branch
        );
        return {
          success: true,
          data: result,
          message: `Successfully deleted "${result.path}" from branch "${result.branch}" in ${input.owner}/${input.repo} (Commit SHA: ${result.commitSha.slice(0, 7)}).`,
        };
      },
    });
  }
}
