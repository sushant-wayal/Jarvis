import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gitHubIntegration, GitHubIntegration } from '../modules/integrations/github/GitHubIntegration';
import { GitHubClient } from '../modules/integrations/github/GitHubClient';
import { integrationManager } from '../modules/integrations/integration-manager';
import { toolRegistry } from '../modules/tools/registry';

describe('GitHub Integration (In Development)', () => {
  const dummyContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'req-1',
    timezone: 'UTC',
    locale: 'en-US',
  };

  beforeEach(async () => {
    integrationManager.register(gitHubIntegration);
    await gitHubIntegration.enable();
  });

  describe('GitHub Tool Capabilities & Confirmation Flags', () => {
    it('enforces confirmation on create_issue (HIGH_RISK, WRITE)', () => {
      const createIssueTool = gitHubIntegration.getTool('github.create_issue');
      expect(createIssueTool).toBeDefined();
      expect(createIssueTool?.requiresConfirmation).toBe(true);
      expect(createIssueTool?.riskLevel).toBe('HIGH_RISK');
      expect(createIssueTool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on create_pull_request (HIGH_RISK, WRITE)', () => {
      const createPrTool = gitHubIntegration.getTool('github.create_pull_request');
      expect(createPrTool).toBeDefined();
      expect(createPrTool?.requiresConfirmation).toBe(true);
      expect(createPrTool?.riskLevel).toBe('HIGH_RISK');
      expect(createPrTool?.actionType).toBe('WRITE');
    });

    it('executes get_repositories with mocked client', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getRepositories').mockResolvedValueOnce([
        {
          name: 'jarvis',
          fullName: 'sushant-wayal/jarvis',
          description: 'AI Personal Assistant',
          stars: 42,
          forks: 5,
          openIssues: 1,
          language: 'TypeScript',
          url: 'https://github.com/sushant-wayal/jarvis',
          isPrivate: false,
        },
      ]);

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_repositories')!;
      const result = await tool.execute({ limit: 5 }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect((result.data as any)[0].name).toBe('jarvis');
      expect(result.message).toContain('Retrieved 1 GitHub repositories');
    });

    it('handles GitHub 401 unauthenticated errors gracefully', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getRepositories').mockRejectedValueOnce(
        new Error('GitHub authentication expired or token invalid. Please reconnect your GitHub token.')
      );

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_repositories')!;
      const result = await tool.execute({ limit: 5 }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('authentication expired');
      expect(result.message).toContain('Error executing');
    });

    it('handles GitHub 403 permission denied / rate limit errors gracefully', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getRepositories').mockRejectedValueOnce(
        new Error('GitHub API rate limit exceeded or access forbidden.')
      );

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_repositories')!;
      const result = await tool.execute({ limit: 5 }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('rate limit exceeded or access forbidden');
    });

    it('handles request timeout gracefully', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getRepositories').mockRejectedValueOnce(
        new Error('GitHub API request to /user/repos timed out after 15 seconds.')
      );

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_repositories')!;
      const result = await tool.execute({ limit: 5 }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out after 15 seconds');
    });

    it('executes create_issue with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'createIssue').mockResolvedValueOnce({
        number: 101,
        title: 'New Feature Bug',
        state: 'open',
        author: 'sushant',
        url: 'https://github.com/owner/repo/issues/101',
        labels: ['bug'],
        createdAt: '2026-09-10T23:00:00Z',
        comments: 0,
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.create_issue')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          title: 'New Feature Bug',
          body: 'Bug description',
          labels: ['bug'],
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).number).toBe(101);
      expect(result.message).toContain('Successfully created issue #101');
    });

    it('executes create_pull_request with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'createPullRequest').mockResolvedValueOnce({
        number: 42,
        title: 'Feature: Extensible Tools',
        state: 'open',
        author: 'sushant',
        url: 'https://github.com/owner/repo/pull/42',
        draft: false,
        createdAt: '2026-09-10T23:00:00Z',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.create_pull_request')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          title: 'Feature: Extensible Tools',
          head: 'feat/tools',
          base: 'main',
          body: 'Implements modular tool registry',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).number).toBe(42);
      expect(result.message).toContain('Successfully created pull request #42');
    });

    it('executes get_commits with mocked client', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getCommits').mockResolvedValueOnce([
        {
          sha: 'abcdef1234567890',
          message: 'feat: add GitHub tools',
          author: 'sushant',
          date: '2026-09-10T23:00:00Z',
          url: 'https://github.com/owner/repo/commit/abcdef1234567890',
        },
      ]);

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_commits')!;
      const result = await tool.execute({ owner: 'owner', repo: 'repo', limit: 5 }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)[0].sha).toBe('abcdef1234567890');
      expect(result.message).toContain('Retrieved 1 recent commits');
    });

    it('executes get_file_content with line slicing on mocked client', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getFileContent').mockResolvedValueOnce({
        type: 'file',
        name: 'index.ts',
        path: 'src/index.ts',
        size: 150,
        content: '10 | export const run = () => console.log("running");\n11 | export const stop = () => {};',
        encoding: 'utf-8',
        url: 'https://github.com/owner/repo/blob/main/src/index.ts',
        totalLines: 50,
        startLine: 10,
        endLine: 11,
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_file_content')!;
      const result = await tool.execute(
        { owner: 'owner', repo: 'repo', path: 'src/index.ts', startLine: 10, endLine: 11 },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).content).toContain('console.log');
      expect((result.data as any).startLine).toBe(10);
      expect((result.data as any).endLine).toBe(11);
      expect(result.message).toContain('lines 10-11 of 50');
    });

    it('executes get_repository_tree with mocked client', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'getRepositoryTree').mockResolvedValueOnce([
        { path: 'src', mode: '040000', type: 'tree' },
        { path: 'src/index.ts', mode: '100644', type: 'blob', size: 150 },
        { path: 'README.md', mode: '100644', type: 'blob', size: 400 },
      ]);

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.get_repository_tree')!;
      const result = await tool.execute({ owner: 'owner', repo: 'repo' }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)).toHaveLength(3);
      expect(result.message).toContain('Retrieved 3 files/directories in tree');
    });

    it('executes search_code with mocked client', async () => {
      const mockClient = new GitHubClient();
      vi.spyOn(mockClient, 'searchCode').mockResolvedValueOnce([
        {
          name: 'auth.ts',
          path: 'src/auth.ts',
          sha: '11223344',
          url: 'https://github.com/owner/repo/blob/main/src/auth.ts',
          repository: 'owner/repo',
        },
      ]);

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.search_code')!;
      const result = await tool.execute(
        { owner: 'owner', repo: 'repo', query: 'validateToken' },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any)[0].name).toBe('auth.ts');
      expect(result.message).toContain('Found 1 code occurrences');
    });

    it('enforces confirmation and metadata on commit_file_change (HIGH_RISK, WRITE)', () => {
      const tool = gitHubIntegration.getTool('github.commit_file_change');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces critical confirmation on delete_file (CRITICAL, DESTRUCTIVE)', () => {
      const tool = gitHubIntegration.getTool('github.delete_file');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('CRITICAL');
      expect(tool?.actionType).toBe('DESTRUCTIVE');
    });

    it('configures create_branch as non-destructive WRITE (HIGH_RISK, no confirmation)', () => {
      const tool = gitHubIntegration.getTool('github.create_branch');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('executes create_branch with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'createBranch').mockResolvedValueOnce({
        name: 'feat/user-settings',
        sha: 'base1234567890',
        ref: 'refs/heads/feat/user-settings',
        repo: 'owner/repo',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.create_branch')!;
      const result = await tool.execute(
        { owner: 'owner', repo: 'repo', branch: 'feat/user-settings', baseBranch: 'main' },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).name).toBe('feat/user-settings');
      expect(result.message).toContain('Successfully created branch "feat/user-settings"');
    });

    it('executes commit_file_change with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'commitFileChange').mockResolvedValueOnce({
        commitSha: 'commit123456',
        contentSha: 'content789012',
        path: 'src/config/settings.ts',
        branch: 'feat/user-settings',
        htmlUrl: 'https://github.com/owner/repo/blob/feat/user-settings/src/config/settings.ts',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.commit_file_change')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          branch: 'feat/user-settings',
          path: 'src/config/settings.ts',
          content: 'export const SETTINGS = { theme: "dark" };',
          message: 'feat: add user theme settings',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).commitSha).toBe('commit123456');
      expect(result.message).toContain('Successfully committed changes to "src/config/settings.ts"');
    });

    it('executes delete_file with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'deleteFile').mockResolvedValueOnce({
        commitSha: 'commit999999',
        path: 'src/legacy/oldConfig.ts',
        branch: 'feat/user-settings',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.delete_file')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          branch: 'feat/user-settings',
          path: 'src/legacy/oldConfig.ts',
          message: 'chore: remove obsolete config file',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).commitSha).toBe('commit999999');
      expect(result.message).toContain('Successfully deleted "src/legacy/oldConfig.ts"');
    });

    it('supports full branch -> commit -> PR workflow sequence', async () => {
      const mockClient = new GitHubClient('mock-token');
      const branchSpy = vi.spyOn(mockClient, 'createBranch').mockResolvedValueOnce({
        name: 'feat/new-feature',
        sha: 'sha111',
        ref: 'refs/heads/feat/new-feature',
        repo: 'owner/repo',
      });
      const commitSpy = vi.spyOn(mockClient, 'commitFileChange').mockResolvedValueOnce({
        commitSha: 'sha222',
        contentSha: 'sha333',
        path: 'src/index.ts',
        branch: 'feat/new-feature',
        htmlUrl: 'https://github.com/owner/repo/blob/feat/new-feature/src/index.ts',
      });
      const prSpy = vi.spyOn(mockClient, 'createPullRequest').mockResolvedValueOnce({
        number: 88,
        title: 'feat: new feature',
        state: 'open',
        author: 'sushant',
        url: 'https://github.com/owner/repo/pull/88',
        draft: false,
        createdAt: '2026-09-10T23:59:59Z',
      });

      const integration = new GitHubIntegration(mockClient);

      // Step 1: Create Branch
      const branchRes = await integration.getTool('github.create_branch')!.execute(
        { owner: 'owner', repo: 'repo', branch: 'feat/new-feature' },
        dummyContext
      );
      expect(branchRes.success).toBe(true);
      expect(branchSpy).toHaveBeenCalledWith('owner', 'repo', 'feat/new-feature', undefined);

      // Step 2: Commit Complete Code
      const commitRes = await integration.getTool('github.commit_file_change')!.execute(
        {
          owner: 'owner',
          repo: 'repo',
          branch: 'feat/new-feature',
          path: 'src/index.ts',
          content: 'export const hello = "world";',
          message: 'feat: add hello export',
        },
        dummyContext
      );
      expect(commitRes.success).toBe(true);
      expect(commitSpy).toHaveBeenCalledWith(
        'owner',
        'repo',
        'src/index.ts',
        'export const hello = "world";',
        'feat: add hello export',
        'feat/new-feature'
      );

      // Step 3: Open Pull Request
      const prRes = await integration.getTool('github.create_pull_request')!.execute(
        {
          owner: 'owner',
          repo: 'repo',
          title: 'feat: new feature',
          head: 'feat/new-feature',
          base: 'main',
          body: 'Implements hello world export',
        },
        dummyContext
      );
      expect(prRes.success).toBe(true);
      expect(prSpy).toHaveBeenCalledWith(
        'owner',
        'repo',
        'feat: new feature',
        'feat/new-feature',
        'main',
        'Implements hello world export'
      );
    });

    it('enforces confirmation on merge_branch, update_pull_request, and merge_pull_request (HIGH_RISK, WRITE)', () => {
      const mergeBranchTool = gitHubIntegration.getTool('github.merge_branch');
      expect(mergeBranchTool).toBeDefined();
      expect(mergeBranchTool?.requiresConfirmation).toBe(true);
      expect(mergeBranchTool?.riskLevel).toBe('HIGH_RISK');
      expect(mergeBranchTool?.actionType).toBe('WRITE');

      const updatePrTool = gitHubIntegration.getTool('github.update_pull_request');
      expect(updatePrTool).toBeDefined();
      expect(updatePrTool?.requiresConfirmation).toBe(true);
      expect(updatePrTool?.riskLevel).toBe('HIGH_RISK');
      expect(updatePrTool?.actionType).toBe('WRITE');

      const mergePrTool = gitHubIntegration.getTool('github.merge_pull_request');
      expect(mergePrTool).toBeDefined();
      expect(mergePrTool?.requiresConfirmation).toBe(true);
      expect(mergePrTool?.riskLevel).toBe('HIGH_RISK');
      expect(mergePrTool?.actionType).toBe('WRITE');
    });

    it('executes merge_branch with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'mergeBranch').mockResolvedValueOnce({
        sha: 'mergeCommitSha123',
        merged: true,
        message: 'Merge branch "feat/login" into main',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.merge_branch')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          base: 'main',
          head: 'feat/login',
          commitMessage: 'Merge branch feat/login into main',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).sha).toBe('mergeCommitSha123');
      expect(result.message).toContain('Successfully merged "feat/login" into "main"');
    });

    it('executes update_pull_request with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'updatePullRequest').mockResolvedValueOnce({
        number: 42,
        title: 'Updated PR Title',
        state: 'closed',
        author: 'sushant',
        url: 'https://github.com/owner/repo/pull/42',
        draft: false,
        createdAt: '2026-09-10T23:00:00Z',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.update_pull_request')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          pullNumber: 42,
          title: 'Updated PR Title',
          state: 'closed',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).title).toBe('Updated PR Title');
      expect((result.data as any).state).toBe('closed');
      expect(result.message).toContain('Successfully updated pull request #42 "Updated PR Title" (State: closed)');
    });

    it('executes merge_pull_request (PR acceptance) with mocked client', async () => {
      const mockClient = new GitHubClient('mock-token');
      vi.spyOn(mockClient, 'mergePullRequest').mockResolvedValueOnce({
        sha: 'mergeSha789',
        merged: true,
        message: 'Pull Request successfully merged',
      });

      const integration = new GitHubIntegration(mockClient);
      const tool = integration.getTool('github.merge_pull_request')!;
      const result = await tool.execute(
        {
          owner: 'owner',
          repo: 'repo',
          pullNumber: 42,
          mergeMethod: 'squash',
          commitTitle: 'feat: squashed feature',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).merged).toBe(true);
      expect(result.message).toContain('Successfully merged and accepted pull request #42');
    });
  });
});
