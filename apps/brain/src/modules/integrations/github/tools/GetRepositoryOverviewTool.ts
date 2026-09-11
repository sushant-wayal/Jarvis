import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { GitHubClient, GitHubRepoSummary } from '../GitHubClient';

export interface RepositoryOverviewData {
  repository: GitHubRepoSummary;
  topLevelEntries: Array<{ name: string; type: 'file' | 'dir'; size?: number }>;
  readmePreview?: string;
  primaryManifest?: { file: string; content: string };
}

export class GetRepositoryOverviewTool extends BaseIntegrationTool<
  { owner: string; repo: string; branch?: string },
  RepositoryOverviewData
> {
  constructor(client: GitHubClient) {
    super({
      id: 'github.get_repository_overview',
      name: 'github.get_repository_overview',
      description:
        'All-in-one high-density repository inspection in a single call. Fetches repository metadata (stars, description, topics, default branch), root directory layout, README preview, and primary package manifest (package.json, requirements.txt, etc.) to minimize tool calls.',
      integrationId: 'github',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      permissions: ['repo', 'read:org'],
      inputSchema: z.object({
        owner: z.string().describe('Repository owner username or organization'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch name or commit SHA (defaults to default branch)'),
      }),
      executor: async (input) => {
        // 1. Fetch repo metadata
        const repo = await client.getRepository(input.owner, input.repo);

        // 2. Fetch root directory items
        let topLevelEntries: Array<{ name: string; type: 'file' | 'dir'; size?: number }> = [];
        try {
          const rootContent = await client.getFileContent(input.owner, input.repo, '', input.branch);
          if (rootContent.entries) {
            topLevelEntries = rootContent.entries.map((e) => ({
              name: e.name,
              type: e.type,
              size: e.size,
            }));
          }
        } catch {
          // If root listing fails, proceed with empty
        }

        // 3. Fetch README preview if available
        let readmePreview: string | undefined;
        try {
          const readmeData = await client.getFileContent(input.owner, input.repo, 'README.md', input.branch, 1, 80);
          if (readmeData.content) {
            readmePreview = readmeData.content;
          }
        } catch {
          // No README.md or not accessible
        }

        // 4. Identify primary manifest from top-level entries
        let primaryManifest: { file: string; content: string } | undefined;
        const manifestCandidates = [
          'package.json',
          'requirements.txt',
          'pyproject.toml',
          'Cargo.toml',
          'go.mod',
          'pom.xml',
        ];
        const foundManifest = topLevelEntries.find((e) => manifestCandidates.includes(e.name.toLowerCase()));
        if (foundManifest) {
          try {
            const manifestData = await client.getFileContent(
              input.owner,
              input.repo,
              foundManifest.name,
              input.branch,
              1,
              80
            );
            if (manifestData.content) {
              primaryManifest = { file: foundManifest.name, content: manifestData.content };
            }
          } catch {
            // Ignore manifest fetch failure
          }
        }

        const data: RepositoryOverviewData = {
          repository: repo,
          topLevelEntries,
          readmePreview,
          primaryManifest,
        };

        return {
          success: true,
          data,
          message: `Retrieved high-density overview for ${input.owner}/${input.repo} (${topLevelEntries.length} root items, ${primaryManifest ? primaryManifest.file : 'no manifest'} detected).`,
        };
      },
    });
  }
}
