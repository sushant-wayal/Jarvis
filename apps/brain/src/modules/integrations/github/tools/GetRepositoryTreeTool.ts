import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubTreeItem } from '../GitHubClient';

export class GetRepositoryTreeTool extends BaseIntegrationTool<
  { owner: string; repo: string; branch?: string; recursive?: boolean },
  GitHubTreeItem[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_repository_tree',
      name: 'github.get_repository_tree',
      description:
        'Explore the full file and directory hierarchy of a GitHub repository to discover files, module layout, and project architecture.',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch name or commit SHA (defaults to HEAD)'),
        recursive: z.boolean().default(true).describe('Whether to recursively fetch the full tree (default: true)'),
      }),
      executor: async (input) => {
        const tree = await client.getRepositoryTree(
          input.owner,
          input.repo,
          input.branch,
          input.recursive ?? true
        );
        return {
          success: true,
          data: tree,
          message: `Retrieved ${tree.length} files/directories in tree for ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
