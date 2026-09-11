import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient } from '../GitHubClient';

export interface BatchFileResult {
  path: string;
  success: boolean;
  content?: string;
  totalLines?: number;
  error?: string;
}

export class GetBatchFilesTool extends BaseIntegrationTool<
  { owner: string; repo: string; paths: string[]; ref?: string; maxLinesPerFile?: number },
  BatchFileResult[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_batch_files',
      name: 'github.get_batch_files',
      description:
        'Read multiple source code files simultaneously from a GitHub repository in a single tool call to inspect architectures and minimize tool usage.',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        paths: z.array(z.string()).min(1).max(8).describe('Array of file paths to fetch (max 8 files)'),
        ref: z.string().optional().describe('Branch, commit SHA, or tag to fetch from (defaults to default branch)'),
        maxLinesPerFile: z.coerce
          .number()
          .min(10)
          .max(200)
          .default(100)
          .describe('Maximum lines to read per file (default 100)'),
      }),
      executor: async (input) => {
        const maxLines = input.maxLinesPerFile || 100;
        const results: BatchFileResult[] = await Promise.all(
          input.paths.map(async (filePath) => {
            try {
              const fileData = await client.getFileContent(
                input.owner,
                input.repo,
                filePath,
                input.ref,
                1,
                maxLines
              );
              return {
                path: filePath,
                success: true,
                content: fileData.content,
                totalLines: fileData.totalLines,
              };
            } catch (err: any) {
              return {
                path: filePath,
                success: false,
                error: err?.message || 'Failed to fetch file',
              };
            }
          })
        );

        const successCount = results.filter((r) => r.success).length;
        return {
          success: true,
          data: results,
          message: `Retrieved ${successCount}/${results.length} files from ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
