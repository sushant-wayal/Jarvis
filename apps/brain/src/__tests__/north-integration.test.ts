import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { northIntegration, NorthIntegration } from '../modules/integrations/north/NorthIntegration';
import { NorthClient } from '../modules/integrations/north/NorthClient';
import { NorthAuth } from '../modules/integrations/north/NorthAuth';
import { integrationManager } from '../modules/integrations/integration-manager';
import { toolRegistry } from '../modules/tools/registry';

describe('North Personal Financial Advisor (PFA) Integration', () => {
  const dummyContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'req-1',
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
  };

  beforeEach(async () => {
    integrationManager.register(northIntegration);
    await northIntegration.enable();
  });

  describe('Integration Lifecycle & Dynamic Discovery', () => {
    it('has correct metadata', () => {
      expect(northIntegration.metadata.id).toBe('north');
      expect(northIntegration.metadata.name).toBe('North');
      expect(northIntegration.metadata.authRequirements.type).toBe('API_KEY');
      expect(northIntegration.metadata.permissions).toContain('financial:read');
      expect(northIntegration.metadata.permissions).toContain('financial:write');
    });

    it('reports status based on configuration and enable state', async () => {
      const mockAuth = new NorthAuth();
      mockAuth.setBaseUrl('http://localhost:3000');
      const integration = new NorthIntegration(new NorthClient(mockAuth));

      await integration.enable();
      expect(await integration.getStatus()).toBe('ENABLED');

      await integration.disable();
      expect(await integration.getStatus()).toBe('DISABLED');
    });

    it('dynamically exposes all 17 North tools to ToolRegistry and Gemini declarations', async () => {
      await northIntegration.enable();
      const allTools = toolRegistry.getAllTools();
      const northTools = allTools.filter((t) => t.name.startsWith('north.'));

      expect(northTools).toHaveLength(17);

      const functionDeclarations = toolRegistry.getGeminiFunctionDeclarations();
      const northFunctions = functionDeclarations.filter((f) => f.name.startsWith('north_'));
      expect(northFunctions).toHaveLength(17);

      // Verify specific Gemini underscore function names
      expect(northFunctions.some((f) => f.name === 'north_get_financial_context')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_dashboard_overview')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_query_transactions')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_add_transaction')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_evaluate_affordability')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_goals')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_create_goal')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_networth')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_investment_suggestion')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_record_investment')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_trigger_gmail_sync')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_search_conversations')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_query_memories')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_save_memory')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_ask_advisor')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_emergency_fund_status')).toBe(true);
      expect(northFunctions.some((f) => f.name === 'north_get_subscriptions')).toBe(true);
    });

    it('dynamically hides tools from ToolRegistry when disabled', async () => {
      await northIntegration.disable();

      const activeTools = integrationManager.getAllActiveTools();
      const northActive = activeTools.filter((t) => t.id.startsWith('north.'));
      expect(northActive).toHaveLength(0);

      const functionDeclarations = toolRegistry.getGeminiFunctionDeclarations();
      const northFunctions = functionDeclarations.filter((f) => f.name.startsWith('north_'));
      expect(northFunctions).toHaveLength(0);

      // Re-enable for subsequent tests
      await northIntegration.enable();
    });
  });

  describe('Tool Safety, Action Types & Confirmation Flags', () => {
    it('enforces confirmation on add_transaction (HIGH_RISK, WRITE)', () => {
      const tool = northIntegration.getTool('north.add_transaction');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on create_goal (HIGH_RISK, WRITE)', () => {
      const tool = northIntegration.getTool('north.create_goal');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on record_investment (HIGH_RISK, WRITE)', () => {
      const tool = northIntegration.getTool('north.record_investment');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('enforces confirmation on trigger_gmail_sync (HIGH_RISK, EXTERNAL_ACTION)', () => {
      const tool = northIntegration.getTool('north.trigger_gmail_sync');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('EXTERNAL_ACTION');
    });

    it('enforces confirmation on save_memory (HIGH_RISK, WRITE)', () => {
      const tool = northIntegration.getTool('north.save_memory');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.riskLevel).toBe('HIGH_RISK');
      expect(tool?.actionType).toBe('WRITE');
    });

    it('declares read tools as SAFE and requiring no confirmation', () => {
      const readTools = [
        'north.get_financial_context',
        'north.get_dashboard_overview',
        'north.query_transactions',
        'north.evaluate_affordability',
        'north.get_goals',
        'north.get_networth',
        'north.get_investment_suggestion',
        'north.search_conversations',
        'north.query_memories',
        'north.ask_advisor',
        'north.get_emergency_fund_status',
        'north.get_subscriptions',
      ];

      for (const toolId of readTools) {
        const tool = northIntegration.getTool(toolId);
        expect(tool).toBeDefined();
        expect(tool?.requiresConfirmation).toBe(false);
        expect(tool?.riskLevel).toBe('SAFE');
        expect(tool?.actionType).toBe('READ');
      }
    });
  });

  describe('Parameter Validation (Zod Schemas)', () => {
    it('rejects invalid parameters for add_transaction', async () => {
      const tool = northIntegration.getTool('north.add_transaction');
      expect(tool).toBeDefined();

      // Negative amount
      const res1 = await tool!.execute(
        { amount: -500, merchant: 'Coffee Shop', transactionType: 'EXPENSE' },
        dummyContext
      );
      expect(res1.success).toBe(false);
      expect(res1.error?.code).toBe('INVALID_PARAMETERS');

      // Missing merchant
      const res2 = await tool!.execute(
        { amount: 500, merchant: '', transactionType: 'EXPENSE' },
        dummyContext
      );
      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('INVALID_PARAMETERS');
    });

    it('rejects invalid parameters for evaluate_affordability', async () => {
      const tool = northIntegration.getTool('north.evaluate_affordability');
      expect(tool).toBeDefined();

      // Negative price
      const res = await tool!.execute({ price: -100 }, dummyContext);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INVALID_PARAMETERS');
    });

    it('rejects invalid parameters for create_goal', async () => {
      const tool = northIntegration.getTool('north.create_goal');
      expect(tool).toBeDefined();

      // Missing targetAmount (non-positive)
      const res = await tool!.execute({ title: 'Goal without target', targetAmount: 0 }, dummyContext);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INVALID_PARAMETERS');
    });
  });

  describe('Tool Execution with Mocked Client', () => {
    let mockClient: NorthClient;
    let testIntegration: NorthIntegration;

    beforeEach(() => {
      mockClient = new NorthClient();
      testIntegration = new NorthIntegration(mockClient);
    });

    it('executes get_financial_context successfully', async () => {
      vi.spyOn(mockClient, 'getFinancialContext').mockResolvedValue({
        filename: 'financial-context-2026-09-17.md',
        content: '# Personal Financial Context\nNet worth: 15L',
      });

      const tool = testIntegration.getTool('north.get_financial_context');
      const result = await tool!.execute({}, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)?.filename).toBe('financial-context-2026-09-17.md');
      expect((result.data as any)?.content).toContain('# Personal Financial Context');
    });

    it('executes get_dashboard_overview successfully', async () => {
      vi.spyOn(mockClient, 'getDashboardOverview').mockResolvedValue({
        financialHealthScore: { score: 88, status: 'HEALTHY' },
        networthSummary: { totals: { assets: 1500000, liabilities: 100000, networth: 1400000 } },
        metrics: { balance: 185000, burnRate: 40000, savingsRate: 35 },
      });

      const tool = testIntegration.getTool('north.get_dashboard_overview');
      const result = await tool!.execute({}, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)?.financialHealthScore?.score).toBe(88);
      expect(result.message).toContain('Financial Health Score: 88/100');
    });

    it('executes query_transactions with filters', async () => {
      vi.spyOn(mockClient, 'queryTransactions').mockResolvedValue({
        data: [
          {
            id: 'tx_1',
            amount: 1200,
            merchant: 'Swiggy',
            transactionType: 'EXPENSE',
            category: 'Food & Dining',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const tool = testIntegration.getTool('north.query_transactions');
      const result = await tool!.execute({ category: 'Food & Dining' }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)?.transactions).toHaveLength(1);
      expect((result.data as any)?.transactions[0].merchant).toBe('Swiggy');
    });

    it('executes add_transaction successfully', async () => {
      vi.spyOn(mockClient, 'addTransaction').mockResolvedValue({
        id: 'tx_new_1',
        amount: 2500,
        merchant: 'Amazon India',
        transactionType: 'EXPENSE',
        category: 'Shopping',
      });

      const tool = testIntegration.getTool('north.add_transaction');
      const result = await tool!.execute(
        {
          amount: 2500,
          merchant: 'Amazon India',
          transactionType: 'EXPENSE',
          category: 'Shopping',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any)?.id).toBe('tx_new_1');
      expect(result.message).toContain('Recorded expense of ₹2,500');
    });

    it('executes evaluate_affordability successfully', async () => {
      vi.spyOn(mockClient, 'evaluateAffordability').mockResolvedValue({
        ok: true,
        isAffordable: true,
        verdict: 'AFFORDABLE',
        currentBalance: 185000,
        balanceAfterPurchase: 110000,
        runwayBefore: 4.5,
        runwayAfter: 2.7,
        efImpact: 'Emergency fund intact',
        recommendation: 'Safe to purchase.',
      });

      const tool = testIntegration.getTool('north.evaluate_affordability');
      const result = await tool!.execute({ price: 75000 }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any)?.verdict).toBe('AFFORDABLE');
      expect(result.message).toContain('Verdict: AFFORDABLE');
    });

    it('executes get_goals and create_goal', async () => {
      vi.spyOn(mockClient, 'getGoals').mockResolvedValue([
        { id: 'g_1', title: 'Emergency Fund', targetAmount: 300000, currentAmount: 180000 },
      ]);
      vi.spyOn(mockClient, 'createGoal').mockResolvedValue({
        id: 'g_2',
        title: 'Japan Vacation',
        targetAmount: 200000,
      });

      const getGoalsTool = testIntegration.getTool('north.get_goals');
      const listResult = await getGoalsTool!.execute({}, dummyContext);
      expect(listResult.success).toBe(true);
      expect((listResult.data as any)?.count).toBe(1);

      const createGoalTool = testIntegration.getTool('north.create_goal');
      const createResult = await createGoalTool!.execute(
        { title: 'Japan Vacation', targetAmount: 200000 },
        dummyContext
      );
      expect(createResult.success).toBe(true);
      expect((createResult.data as any)?.id).toBe('g_2');
    });

    it('executes get_investment_suggestion and record_investment', async () => {
      vi.spyOn(mockClient, 'getInvestmentSuggestion').mockResolvedValue({
        totalInvestable: 50000,
        streak: 4,
        phase: 'WEALTH_BUILDING',
        phaseLabel: 'Wealth Building Phase',
        buckets: {
          equity: { pct: 70, suggested: 35000 },
          debt: { pct: 20, suggested: 10000 },
          gold: { pct: 10, suggested: 5000 },
        },
      });
      vi.spyOn(mockClient, 'recordInvestment').mockResolvedValue({
        ok: true,
        message: 'Cycle 5 recorded.',
      });

      const getSuggestionTool = testIntegration.getTool('north.get_investment_suggestion');
      const suggestionResult = await getSuggestionTool!.execute({}, dummyContext);
      expect(suggestionResult.success).toBe(true);
      expect((suggestionResult.data as any)?.totalInvestable).toBe(50000);

      const recordTool = testIntegration.getTool('north.record_investment');
      const recordResult = await recordTool!.execute({ notes: 'Zerodha SIP' }, dummyContext);
      expect(recordResult.success).toBe(true);
      expect(recordResult.message).toContain('Cycle 5 recorded.');
    });

    it('executes trigger_gmail_sync', async () => {
      vi.spyOn(mockClient, 'triggerGmailSync').mockResolvedValue({
        ok: true,
        message: 'Synced 14 new transactions.',
      });

      const syncTool = testIntegration.getTool('north.trigger_gmail_sync');
      const result = await syncTool!.execute({}, dummyContext);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Synced 14 new transactions.');
    });

    it('executes get_emergency_fund_status and get_subscriptions', async () => {
      vi.spyOn(mockClient, 'getEmergencyFundStatus').mockResolvedValue({
        ok: true,
        efStrategy: 'BALANCED',
        targetMonths: 6,
        targetAmount: 240000,
        savedAmount: 180000,
        shortfall: 60000,
        progressPct: 75,
        tier: 2,
        efMonthlyDrip: 15000,
        monthsToComplete: 4,
        isComplete: false,
      });
      vi.spyOn(mockClient, 'getSubscriptions').mockResolvedValue([
        { id: 'sub_1', merchant: 'Netflix', amount: 649, active: true },
        { id: 'sub_2', merchant: 'Spotify', amount: 119, active: true },
      ]);

      const efTool = testIntegration.getTool('north.get_emergency_fund_status');
      const efResult = await efTool!.execute({}, dummyContext);
      expect(efResult.success).toBe(true);
      expect((efResult.data as any)?.progressPct).toBe(75);

      const subTool = testIntegration.getTool('north.get_subscriptions');
      const subResult = await subTool!.execute({}, dummyContext);
      expect(subResult.success).toBe(true);
      expect((subResult.data as any)?.totalMonthlyBurn).toBe(768);
    });
  });

  describe('HTTP Error Handling & Translation in NorthClient', () => {
    it('handles 401 Unauthorized with descriptive message', async () => {
      const client = new NorthClient();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
      );

      await expect(client.getDashboardOverview()).rejects.toThrow(
        'North authentication failed or token invalid'
      );
    });

    it('handles 404 Not Found with descriptive message', async () => {
      const client = new NorthClient();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

      await expect(client.getGoals()).rejects.toThrow('North resource not found');
    });
  });
});
