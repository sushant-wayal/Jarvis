import { IntegrationMetadata, IntegrationStatus } from '@jarvis/shared';
import { BaseIntegration } from '../base-integration';
import { NorthAuth } from './NorthAuth';
import { NorthClient } from './NorthClient';

import { GetFinancialContextTool } from './tools/GetFinancialContextTool';
import { GetDashboardOverviewTool } from './tools/GetDashboardOverviewTool';
import { QueryTransactionsTool } from './tools/QueryTransactionsTool';
import { AddTransactionTool } from './tools/AddTransactionTool';
import { EvaluateAffordabilityTool } from './tools/EvaluateAffordabilityTool';
import { GetGoalsTool } from './tools/GetGoalsTool';
import { CreateGoalTool } from './tools/CreateGoalTool';
import { GetNetworthTool } from './tools/GetNetworthTool';
import { GetInvestmentSuggestionTool } from './tools/GetInvestmentSuggestionTool';
import { RecordInvestmentTool } from './tools/RecordInvestmentTool';
import { TriggerGmailSyncTool } from './tools/TriggerGmailSyncTool';
import { SearchConversationsTool } from './tools/SearchConversationsTool';
import { QueryMemoriesTool } from './tools/QueryMemoriesTool';
import { SaveMemoryTool } from './tools/SaveMemoryTool';
import { AskAdvisorTool } from './tools/AskAdvisorTool';
import { GetEmergencyFundStatusTool } from './tools/GetEmergencyFundStatusTool';
import { GetSubscriptionsTool } from './tools/GetSubscriptionsTool';

export class NorthIntegration extends BaseIntegration {
  public readonly metadata: IntegrationMetadata;
  private auth: NorthAuth;
  private client: NorthClient;

  constructor(client?: NorthClient) {
    super();
    this.auth = client ? client.getAuth() : new NorthAuth();
    this.client = client || new NorthClient(this.auth);

    this.metadata = {
      id: 'north',
      name: 'North',
      description:
        'Personal Financial Advisor managing balances, transactions, net worth, investments, goals, affordability, and financial insights',
      version: '1.0.0',
      authRequirements: this.auth.getAuthConfig(),
      permissions: ['financial:read', 'financial:write'],
    };

    this.registerTools();
  }

  public getAuth(): NorthAuth {
    return this.auth;
  }

  public getClient(): NorthClient {
    return this.client;
  }

  public override async getStatus(): Promise<IntegrationStatus> {
    if (!this.enabled) {
      return 'DISABLED';
    }
    return this.auth.isConfigured() ? 'ENABLED' : 'CONFIG_REQUIRED';
  }

  public override async authenticate(credentials: Record<string, string>): Promise<boolean> {
    if (credentials.apiKey) {
      this.auth.setApiKey(credentials.apiKey);
    }
    if (credentials.baseUrl) {
      this.auth.setBaseUrl(credentials.baseUrl);
    }
    const configured = this.auth.isConfigured();
    this.metadata.authRequirements.isConfigured = configured;
    return configured;
  }

  public override async disconnect(): Promise<void> {
    this.auth.clearApiKey();
    this.metadata.authRequirements.isConfigured = false;
  }

  private registerTools(): void {
    this.registerTool(new GetFinancialContextTool(this.client));
    this.registerTool(new GetDashboardOverviewTool(this.client));
    this.registerTool(new QueryTransactionsTool(this.client));
    this.registerTool(new AddTransactionTool(this.client));
    this.registerTool(new EvaluateAffordabilityTool(this.client));
    this.registerTool(new GetGoalsTool(this.client));
    this.registerTool(new CreateGoalTool(this.client));
    this.registerTool(new GetNetworthTool(this.client));
    this.registerTool(new GetInvestmentSuggestionTool(this.client));
    this.registerTool(new RecordInvestmentTool(this.client));
    this.registerTool(new TriggerGmailSyncTool(this.client));
    this.registerTool(new SearchConversationsTool(this.client));
    this.registerTool(new QueryMemoriesTool(this.client));
    this.registerTool(new SaveMemoryTool(this.client));
    this.registerTool(new AskAdvisorTool(this.client));
    this.registerTool(new GetEmergencyFundStatusTool(this.client));
    this.registerTool(new GetSubscriptionsTool(this.client));
  }
}

export const northIntegration = new NorthIntegration();
