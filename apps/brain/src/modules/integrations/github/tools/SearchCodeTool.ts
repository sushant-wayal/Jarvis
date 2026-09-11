import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubCodeSearchResult } from '../GitHubClient';

export class SearchCodeTool extends BaseIntegrationTool<
  { owner: string; repo: string; query: string; limit?: number },
  GitHubCodeSearchResult[]
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.search_code',
      name: 'github.search_code',
      description:
        'Search for code patterns, function names, classes, or keywords across a GitHub repository.',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        query: z.string().min(1).describe('The code symbol, function name, class, or keyword to search for'),
        limit: z.coerce.number().min(1).max(30).default(10).describe('Maximum search results to return'),
      }),
      executor: async (input) => {
        const results = await client.searchCode(input.owner, input.repo, input.query, input.limit || 10);
        return {
          success: true,
          data: results,
          message: `Found ${results.length} code occurrences matching "${input.query}" in ${input.owner}/${input.repo}.`,
        };
      },
    });
  }
}
