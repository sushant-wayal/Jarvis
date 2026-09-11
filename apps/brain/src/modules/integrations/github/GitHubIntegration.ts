import { IntegrationMetadata, IntegrationStatus } from '@jarvis/shared';
import { BaseIntegration } from '../base-integration';
import { GitHubAuth } from './GitHubAuth';
import { GitHubClient } from './GitHubClient';
import { CreateBranchTool } from './tools/CreateBranchTool';
import { CommitFileChangeTool } from './tools/CommitFileChangeTool';
import { DeleteFileTool } from './tools/DeleteFileTool';
import { MergeBranchTool } from './tools/MergeBranchTool';
import { UpdatePullRequestTool } from './tools/UpdatePullRequestTool';
import { MergePullRequestTool } from './tools/MergePullRequestTool';
import { CreateIssueTool } from './tools/CreateIssueTool';
import { CreatePullRequestTool } from './tools/CreatePullRequestTool';
import { GetCommitsTool } from './tools/GetCommitsTool';
import { GetFileContentTool } from './tools/GetFileContentTool';
import { GetIssuesTool } from './tools/GetIssuesTool';
import { GetPullRequestsTool } from './tools/GetPullRequestsTool';
import { GetRepositoriesTool } from './tools/GetRepositoriesTool';
import { GetRepositoryTool } from './tools/GetRepositoryTool';
import { GetRepositoryTreeTool } from './tools/GetRepositoryTreeTool';
import { SearchCodeTool } from './tools/SearchCodeTool';
import { GetRepositoryOverviewTool } from './tools/GetRepositoryOverviewTool';
import { GetBatchFilesTool } from './tools/GetBatchFilesTool';

export class GitHubIntegration extends BaseIntegration {
  public readonly metadata: IntegrationMetadata;
  private auth: GitHubAuth;
  private client: GitHubClient;

  constructor(client?: GitHubClient) {
    super();
    this.auth = client ? client.getAuth() : new GitHubAuth();
    this.client = client || new GitHubClient(this.auth);

    this.metadata = {
      id: 'github',
      name: 'GitHub',
      description: 'Interact with GitHub repositories, issues, pull requests, and inspect codebases',
      version: '1.0.0',
      authRequirements: this.auth.getAuthConfig(),
      permissions: ['repo', 'read:org'],
    };

    this.registerTools();
  }

  public getAuth(): GitHubAuth {
    return this.auth;
  }

  public getClient(): GitHubClient {
    return this.client;
  }

  public override async getStatus(): Promise<IntegrationStatus> {
    if (!this.enabled) {
      return 'DISABLED';
    }
    return this.auth.isConfigured() ? 'ENABLED' : 'CONFIG_REQUIRED';
  }

  public override async authenticate(credentials: Record<string, string>): Promise<boolean> {
    if (credentials.token) {
      this.auth.setToken(credentials.token);
      this.metadata.authRequirements.isConfigured = true;
      return true;
    }
    return false;
  }

  public override async disconnect(): Promise<void> {
    this.auth.clearToken();
    this.metadata.authRequirements.isConfigured = false;
  }

  private registerTools(): void {
    this.registerTool(new GetRepositoriesTool(this.client));
    this.registerTool(new GetRepositoryTool(this.client));
    this.registerTool(new GetIssuesTool(this.client));
    this.registerTool(new CreateIssueTool(this.client));
    this.registerTool(new GetPullRequestsTool(this.client));
    this.registerTool(new CreatePullRequestTool(this.client));
    this.registerTool(new GetCommitsTool(this.client));
    this.registerTool(new GetFileContentTool(this.client));
    this.registerTool(new GetRepositoryTreeTool(this.client));
    this.registerTool(new GetRepositoryOverviewTool(this.client));
    this.registerTool(new GetBatchFilesTool(this.client));
    this.registerTool(new SearchCodeTool(this.client));
    this.registerTool(new CreateBranchTool(this.client));
    this.registerTool(new CommitFileChangeTool(this.client));
    this.registerTool(new DeleteFileTool(this.client));
    this.registerTool(new MergeBranchTool(this.client));
    this.registerTool(new UpdatePullRequestTool(this.client));
    this.registerTool(new MergePullRequestTool(this.client));
  }
}

export const gitHubIntegration = new GitHubIntegration();
