import { logger } from '@/lib/logging/logger';
import { GitHubAuth } from './GitHubAuth';

export interface GitHubRepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  url: string;
  isPrivate: boolean;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  state: string;
  author: string;
  url: string;
  labels: string[];
  createdAt: string;
  comments: number;
}

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  state: string;
  author: string;
  url: string;
  draft: boolean;
  createdAt: string;
}

export interface GitHubCommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubFileContent {
  type: 'file' | 'dir';
  name: string;
  path: string;
  size: number;
  content?: string;
  encoding?: string;
  url: string;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
  entries?: Array<{ name: string; path: string; type: 'file' | 'dir'; size: number }>;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface GitHubCodeSearchResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  repository: string;
}

export interface GitHubBranchSummary {
  name: string;
  sha: string;
  ref: string;
  repo: string;
}

export interface GitHubCommitResult {
  commitSha: string;
  contentSha: string;
  path: string;
  branch: string;
  htmlUrl: string;
}

export interface GitHubDeleteResult {
  commitSha: string;
  path: string;
  branch: string;
}

export interface GitHubMergeResult {
  sha: string;
  merged: boolean;
  message: string;
}

export class GitHubClient {
  private auth: GitHubAuth;
  private baseUrl: string = 'https://api.github.com';

  constructor(auth?: GitHubAuth | string) {
    if (typeof auth === 'string') {
      this.auth = new GitHubAuth();
      this.auth.setToken(auth);
    } else {
      this.auth = auth || new GitHubAuth();
    }
  }

  public getAuth(): GitHubAuth {
    return this.auth;
  }

  public setToken(token: string): void {
    this.auth.setToken(token);
  }

  public hasToken(): boolean {
    return this.auth.isConfigured();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Jarvis-Assistant/2.0',
      ...(options.headers as Record<string, string>),
    };

    const token = this.auth.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const response = await fetch(url, {
        signal: options.signal || AbortSignal.timeout(15000),
        ...options,
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('GitHub authentication expired or token invalid. Please reconnect your GitHub token.');
        }
        if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded or access forbidden.');
        }
        if (response.status === 404) {
          throw new Error(`GitHub resource not found at ${path}.`);
        }
        if (response.status === 422) {
          const body = await response.json().catch(() => ({}));
          throw new Error(`GitHub validation failed: ${JSON.stringify(body)}`);
        }
        throw new Error(`GitHub API returned HTTP ${response.status}: ${response.statusText}`);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        const timeoutError = new Error(`GitHub API request to ${path} timed out after 15 seconds.`);
        logger.error('GitHub API request timed out', timeoutError, { path });
        throw timeoutError;
      }
      logger.error('GitHub API request failed', err, { path });
      throw err;
    }
  }

  public async getRepositories(limit: number = 10): Promise<GitHubRepoSummary[]> {
    const endpoint = this.hasToken()
      ? `/user/repos?sort=updated&per_page=${limit}`
      : `/repositories?per_page=${limit}`;
    const repos = await this.request<any[]>(endpoint);
    return repos.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      language: r.language,
      url: r.html_url,
      isPrivate: Boolean(r.private),
    }));
  }

  public async getRepository(owner: string, repo: string): Promise<GitHubRepoSummary> {
    const r = await this.request<any>(`/repos/${owner}/${repo}`);
    return {
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      language: r.language,
      url: r.html_url,
      isPrivate: Boolean(r.private),
    };
  }

  public async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    limit: number = 10
  ): Promise<GitHubIssueSummary[]> {
    const issues = await this.request<any[]>(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`
    );
    return issues
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.user?.login || 'unknown',
        url: i.html_url,
        labels: (i.labels || []).map((l: any) => l.name || l),
        createdAt: i.created_at,
        comments: i.comments ?? 0,
      }));
  }

  public async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<GitHubIssueSummary> {
    if (!this.hasToken()) {
      throw new Error('Creating GitHub issues requires an authenticated GITHUB_TOKEN.');
    }
    const issue = await this.request<any>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user?.login || 'unknown',
      url: issue.html_url,
      labels: (issue.labels || []).map((l: any) => l.name || l),
      createdAt: issue.created_at,
      comments: 0,
    };
  }

  public async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    limit: number = 10
  ): Promise<GitHubPullRequestSummary[]> {
    const prs = await this.request<any[]>(
      `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`
    );
    return prs.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      author: p.user?.login || 'unknown',
      url: p.html_url,
      draft: Boolean(p.draft),
      createdAt: p.created_at,
    }));
  }

  public async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<GitHubPullRequestSummary> {
    if (!this.hasToken()) {
      throw new Error('Creating GitHub pull requests requires an authenticated GITHUB_TOKEN.');
    }
    const pr = await this.request<any>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        head,
        base,
        body,
      }),
    });
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login || 'unknown',
      url: pr.html_url,
      draft: Boolean(pr.draft),
      createdAt: pr.created_at,
    };
  }

  public async getCommits(
    owner: string,
    repo: string,
    limit: number = 10
  ): Promise<GitHubCommitSummary[]> {
    const commits = await this.request<any[]>(
      `/repos/${owner}/${repo}/commits?per_page=${limit}`
    );
    return commits.map((c) => ({
      sha: c.sha ? c.sha.substring(0, 7) : '',
      message: c.commit?.message?.split('\n')[0] || '',
      author: c.commit?.author?.name || c.author?.login || 'unknown',
      date: c.commit?.author?.date || '',
      url: c.html_url,
    }));
  }

  public async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    startLine?: number,
    endLine?: number
  ): Promise<GitHubFileContent> {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const endpoint = `/repos/${owner}/${repo}/contents/${cleanPath}${
      ref ? `?ref=${encodeURIComponent(ref)}` : ''
    }`;
    const res = await this.request<any>(endpoint);

    if (Array.isArray(res)) {
      return {
        type: 'dir',
        name: cleanPath.split('/').pop() || cleanPath,
        path: cleanPath,
        size: res.length,
        url: `https://github.com/${owner}/${repo}/tree/${ref || 'HEAD'}/${cleanPath}`,
        entries: res.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type === 'dir' ? 'dir' : 'file',
          size: item.size || 0,
        })),
      };
    }

    let decodedContent = '';
    let totalLines = 0;
    if (res.content && res.encoding === 'base64') {
      decodedContent = Buffer.from(res.content, 'base64').toString('utf-8');
      const lines = decodedContent.split('\n');
      totalLines = lines.length;

      if (startLine !== undefined || endLine !== undefined) {
        const start = Math.max(1, startLine || 1);
        const end = Math.min(totalLines, endLine || totalLines);
        // Slicing 1-indexed lines
        decodedContent = lines
          .slice(start - 1, end)
          .map((line, idx) => `${start + idx} | ${line}`)
          .join('\n');
      } else if (decodedContent.length > 50000) {
        decodedContent = decodedContent.slice(0, 50000) + '\n\n... [Content truncated for length]';
      }
    }

    return {
      type: 'file',
      name: res.name,
      path: res.path,
      size: res.size,
      content: decodedContent,
      encoding: 'utf-8',
      url: res.html_url,
      totalLines,
      startLine: startLine || 1,
      endLine: endLine || totalLines,
    };
  }

  public async getRepositoryTree(
    owner: string,
    repo: string,
    branch?: string,
    recursive: boolean = true
  ): Promise<GitHubTreeItem[]> {
    const treeSha = branch || 'HEAD';
    const endpoint = `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}${
      recursive ? '?recursive=1' : ''
    }`;
    const res = await this.request<{ tree?: any[]; truncated?: boolean }>(endpoint);
    const tree = res.tree || [];

    return tree
      .filter((item) => !item.path.startsWith('.git/'))
      .slice(0, 150)
      .map((item) => ({
        path: item.path,
        mode: item.mode,
        type: item.type === 'tree' ? 'tree' : 'blob',
        size: item.size,
      }));
  }

  public async searchCode(
    owner: string,
    repo: string,
    query: string,
    limit: number = 10
  ): Promise<GitHubCodeSearchResult[]> {
    const endpoint = `/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}&per_page=${limit}`;
    const res = await this.request<{ items?: any[] }>(endpoint);
    return (res.items || []).map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      url: item.html_url,
      repository: `${owner}/${repo}`,
    }));
  }

  public async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch?: string
  ): Promise<GitHubBranchSummary> {
    let resolvedBaseBranch = baseBranch;
    if (!resolvedBaseBranch) {
      const repoInfo = await this.request<{ default_branch?: string }>(`/repos/${owner}/${repo}`);
      resolvedBaseBranch = repoInfo.default_branch || 'main';
    }

    const baseCommit = await this.request<{ sha: string }>(
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(resolvedBaseBranch)}`
    );
    const baseSha = baseCommit.sha;

    const cleanBranch = branchName.replace(/^refs\/heads\//, '');
    const ref = `refs/heads/${cleanBranch}`;

    await this.request<{ ref: string; object: { sha: string } }>(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref,
        sha: baseSha,
      }),
    });

    return {
      name: cleanBranch,
      sha: baseSha,
      ref,
      repo: `${owner}/${repo}`,
    };
  }

  public async commitFileChange(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<GitHubCommitResult> {
    const cleanPath = path.replace(/^\/+/, '');
    const cleanBranch = branch.replace(/^refs\/heads\//, '');

    let existingSha: string | undefined;
    try {
      const existing = await this.request<{ sha?: string }>(
        `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(cleanBranch)}`
      );
      if (existing && existing.sha) {
        existingSha = existing.sha;
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('not found') && !msg.includes('404')) {
        throw err;
      }
    }

    const base64Content = Buffer.from(content, 'utf-8').toString('base64');
    const body: Record<string, any> = {
      message,
      content: base64Content,
      branch: cleanBranch,
    };
    if (existingSha) {
      body.sha = existingSha;
    }

    const res = await this.request<{
      content?: { sha: string; html_url: string; path: string };
      commit?: { sha: string; html_url: string };
    }>(`/repos/${owner}/${repo}/contents/${cleanPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      commitSha: res.commit?.sha || '',
      contentSha: res.content?.sha || '',
      path: cleanPath,
      branch: cleanBranch,
      htmlUrl:
        res.content?.html_url ||
        res.commit?.html_url ||
        `https://github.com/${owner}/${repo}/blob/${cleanBranch}/${cleanPath}`,
    };
  }

  public async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    branch: string
  ): Promise<GitHubDeleteResult> {
    const cleanPath = path.replace(/^\/+/, '');
    const cleanBranch = branch.replace(/^refs\/heads\//, '');

    let existingSha: string | undefined;
    try {
      const existing = await this.request<{ sha?: string }>(
        `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(cleanBranch)}`
      );
      existingSha = existing?.sha;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
        throw new Error(`Cannot delete ${cleanPath}: file does not exist on branch "${cleanBranch}".`);
      }
      throw err;
    }

    if (!existingSha) {
      throw new Error(`Cannot delete ${cleanPath}: could not resolve file SHA on branch "${cleanBranch}".`);
    }

    const res = await this.request<{
      commit?: { sha: string };
    }>(`/repos/${owner}/${repo}/contents/${cleanPath}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sha: existingSha,
        branch: cleanBranch,
      }),
    });

    return {
      commitSha: res.commit?.sha || '',
      path: cleanPath,
      branch: cleanBranch,
    };
  }

  public async mergeBranch(
    owner: string,
    repo: string,
    base: string,
    head: string,
    commitMessage?: string
  ): Promise<GitHubMergeResult> {
    if (!this.hasToken()) {
      throw new Error('Merging branches requires an authenticated GITHUB_TOKEN.');
    }
    const cleanBase = base.replace(/^refs\/heads\//, '');
    const cleanHead = head.replace(/^refs\/heads\//, '');

    const body: Record<string, any> = {
      base: cleanBase,
      head: cleanHead,
    };
    if (commitMessage) {
      body.commit_message = commitMessage;
    }

    const res = await this.request<{
      sha?: string;
      commit?: { message?: string };
      message?: string;
    }>(`/repos/${owner}/${repo}/merges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      sha: res.sha || '',
      merged: true,
      message: res.commit?.message || res.message || `Successfully merged "${cleanHead}" into "${cleanBase}".`,
    };
  }

  public async updatePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      base?: string;
    }
  ): Promise<GitHubPullRequestSummary> {
    if (!this.hasToken()) {
      throw new Error('Updating GitHub pull requests requires an authenticated GITHUB_TOKEN.');
    }
    const pr = await this.request<any>(`/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login || 'unknown',
      url: pr.html_url,
      draft: Boolean(pr.draft),
      createdAt: pr.created_at,
    };
  }

  public async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<GitHubMergeResult> {
    if (!this.hasToken()) {
      throw new Error('Merging / accepting GitHub pull requests requires an authenticated GITHUB_TOKEN.');
    }
    const body: Record<string, any> = {};
    if (options?.commitTitle) body.commit_title = options.commitTitle;
    if (options?.commitMessage) body.commit_message = options.commitMessage;
    if (options?.mergeMethod) body.merge_method = options.mergeMethod;

    const res = await this.request<{
      sha?: string;
      merged?: boolean;
      message?: string;
    }>(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      sha: res.sha || '',
      merged: Boolean(res.merged),
      message: res.message || `Successfully merged pull request #${pullNumber}.`,
    };
  }
}
