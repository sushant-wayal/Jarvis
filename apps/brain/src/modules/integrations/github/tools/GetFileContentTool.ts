import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubFileContent } from '../GitHubClient';

export class GetFileContentTool extends BaseIntegrationTool<
  { owner: string; repo: string; path: string; ref?: string; startLine?: number; endLine?: number },
  GitHubFileContent
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_file_content',
      name: 'github.get_file_content',
      description:
        'Read the actual source code or text content of any file (or directory listing) in a GitHub repository to analyze code and answer technical questions.',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File or directory path in the repository (e.g. "src/index.ts", "package.json")'),
        ref: z.string().optional().describe('Branch, commit SHA, or tag to fetch from (defaults to default branch)'),
        startLine: z.coerce.number().min(1).optional().describe('Optional 1-indexed starting line number to read from'),
        endLine: z.coerce.number().min(1).optional().describe('Optional 1-indexed ending line number to read until'),
      }),
      executor: async (input) => {
        const fileData = await client.getFileContent(
          input.owner,
          input.repo,
          input.path,
          input.ref,
          input.startLine,
          input.endLine
        );
        if (fileData.type === 'dir') {
          return {
            success: true,
            data: fileData,
            message: `Directory "${input.path}" in ${input.owner}/${input.repo} contains ${fileData.entries?.length || 0} items.`,
          };
        }
        const lineInfo =
          fileData.startLine && fileData.endLine
            ? ` (lines ${fileData.startLine}-${fileData.endLine} of ${fileData.totalLines})`
            : '';
        return {
          success: true,
          data: fileData,
          message: `Retrieved file "${input.path}"${lineInfo} from ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
