import { logger } from '@/lib/logging/logger';
import { NorthAuth } from './NorthAuth';

export interface NorthOverviewData {
  networthSummary?: {
    totals: {
      assets: number;
      liabilities: number;
      networth: number;
    };
  };
  financialHealthScore?: {
    score: number;
    status: string;
    breakdown?: Record<string, unknown>;
  };
  metrics?: {
    balance?: number;
    burnRate?: number;
    runwayMonths?: number;
    emergencyFund?: { saved: number; target: number; progressPct: number };
    savingsRate?: number;
    monthlyIncome?: number;
    monthlyExpenses?: number;
  };
  budgets?: unknown[];
  insights?: unknown[];
}

export interface NorthTransaction {
  id: string;
  amount: number;
  merchant: string;
  type?: string;
  transactionType: 'EXPENSE' | 'INCOME' | 'TRANSFER' | string;
  timestamp?: string;
  category?: { id?: string; name: string } | string;
  notes?: string;
  paymentMethod?: string;
  bankName?: string;
}

export interface NorthGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount?: number;
  monthlyTarget?: number;
  targetDate?: string;
  priority?: number;
  status?: string;
  notes?: string;
}

export interface NorthNetworth {
  totals: {
    networth: number;
    assets: number;
    liabilities: number;
  };
  assets: Record<string, unknown[]>;
  liabilities: Record<string, unknown[]>;
}

export interface NorthInvestmentSuggestion {
  phase?: string;
  phaseLabel?: string;
  rawSurplus?: number;
  smoothedSurplus?: number;
  investableRate?: number;
  totalInvestable: number;
  streak?: number;
  buckets?: {
    equity?: { pct: number; suggested: number; final?: number };
    debt?: { pct: number; suggested: number; final?: number };
    gold?: { pct: number; suggested: number; final?: number };
  };
}

export interface NorthAffordabilityResult {
  ok: boolean;
  isAffordable: boolean;
  verdict: string;
  currentBalance: number;
  balanceAfterPurchase: number;
  runwayBefore: number;
  runwayAfter: number;
  efImpact: string;
  recommendation: string;
}

export interface NorthEmergencyFundStatus {
  ok: boolean;
  efStrategy: string;
  targetMonths: number;
  targetAmount: number;
  savedAmount: number;
  shortfall: number;
  progressPct: number;
  tier: number;
  efMonthlyDrip: number;
  monthsToComplete: number;
  isComplete: boolean;
}

export interface NorthSubscription {
  id: string;
  merchant: string;
  amount: number;
  interval?: string;
  nextCharge?: string;
  active?: boolean;
}

export interface NorthConversation {
  id: string;
  key: string;
  name: string;
  value: string;
  expiresAt?: string;
  isExpired?: boolean;
  expiresInDays?: number;
  expiryLabel?: string;
}

export interface NorthMemory {
  id?: string;
  key?: string;
  name?: string;
  value?: string;
  expiresAt?: string;
  isExpired?: boolean;
  tags?: string[];
}

export class NorthClient {
  private auth: NorthAuth;

  constructor(auth?: NorthAuth) {
    this.auth = auth || new NorthAuth();
  }

  public getAuth(): NorthAuth {
    return this.auth;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined | null>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, params, timeout = 15000 } = options;
    const baseUrl = this.auth.getBaseUrl();
    const apiKey = this.auth.getApiKey();

    let urlStr = `${baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        urlStr += (urlStr.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      logger.info(`[NorthClient] ${method} ${urlStr}`);
      const response = await fetch(urlStr, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBodyText = '';
        try {
          errorBodyText = await response.text();
        } catch {
          // ignore
        }

        if (response.status === 401) {
          throw new Error('North authentication failed or token invalid. Please check your credentials.');
        }
        if (response.status === 403) {
          throw new Error('North access forbidden or rate limit reached.');
        }
        if (response.status === 404) {
          throw new Error(`North resource not found at ${endpoint}.`);
        }
        if (response.status === 422) {
          throw new Error(`North validation error: ${errorBodyText || response.statusText}`);
        }

        throw new Error(
          `North API error (${response.status} ${response.statusText}): ${errorBodyText || 'Unknown error'}`
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`North request to ${endpoint} timed out after ${timeout / 1000} seconds.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  public async getFinancialContext(): Promise<{ filename: string; content: string }> {
    const res = await this.request<{ ok: boolean; filename: string; content: string }>('/api/export-context');
    return {
      filename: res.filename || 'financial-context.md',
      content: res.content || '',
    };
  }

  public async getDashboardOverview(): Promise<NorthOverviewData> {
    const res = await this.request<{ ok: boolean; data: NorthOverviewData }>('/api/dashboard/overview');
    return res.data || {};
  }

  public async queryTransactions(params: {
    search?: string;
    category?: string;
    type?: string;
    dateRange?: string;
    amountMin?: number;
    amountMax?: number;
    merchant?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  }): Promise<{
    data: NorthTransaction[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    categories?: string[];
  }> {
    const res = await this.request<{
      data: NorthTransaction[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      categories?: string[];
    }>('/api/transactions/list', { params });
    return {
      data: res.data || [],
      total: res.total || 0,
      page: res.page || 1,
      pageSize: res.pageSize || 20,
      totalPages: res.totalPages || 1,
      categories: res.categories,
    };
  }

  public async addTransaction(data: {
    amount: number;
    merchant: string;
    transactionType: string;
    type?: string;
    category?: string;
    paymentMethod?: string;
    bankName?: string;
    notes?: string;
    timestamp?: string;
  }): Promise<NorthTransaction> {
    const res = await this.request<{ ok: boolean; transaction: NorthTransaction }>('/api/transactions', {
      method: 'POST',
      body: data,
    });
    return res.transaction;
  }

  public async evaluateAffordability(price: number): Promise<NorthAffordabilityResult> {
    return await this.request<NorthAffordabilityResult>('/api/affordability/evaluate', {
      method: 'POST',
      body: { price },
    });
  }

  public async getGoals(): Promise<NorthGoal[]> {
    const res = await this.request<{ ok: boolean; goals: NorthGoal[] }>('/api/goals');
    return res.goals || [];
  }

  public async createGoal(data: {
    title: string;
    targetAmount: number;
    targetDate?: string;
    priority?: number;
    initialAllocation?: number;
    notes?: string;
  }): Promise<NorthGoal> {
    const res = await this.request<{ ok: boolean; goal: NorthGoal }>('/api/goals', {
      method: 'POST',
      body: data,
    });
    return res.goal;
  }

  public async getNetworth(): Promise<NorthNetworth> {
    return await this.request<NorthNetworth>('/api/networth');
  }

  public async getInvestmentSuggestion(): Promise<NorthInvestmentSuggestion> {
    const res = await this.request<{ ok: boolean; suggestion: NorthInvestmentSuggestion }>('/api/investments');
    return res.suggestion || { totalInvestable: 0 };
  }

  public async recordInvestment(notes?: string): Promise<{ ok: boolean; message?: string }> {
    return await this.request<{ ok: boolean; message?: string }>('/api/investments/invest', {
      method: 'POST',
      body: { notes },
    });
  }

  public async triggerGmailSync(): Promise<{ ok: boolean; message?: string }> {
    return await this.request<{ ok: boolean; message?: string }>('/api/gmail/sync', {
      method: 'POST',
      body: {},
    });
  }

  public async searchConversations(params: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    conversations: NorthConversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }> {
    return await this.request<{
      conversations: NorthConversation[];
      pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
    }>('/api/ai/conversations', { params });
  }

  public async queryMemories(): Promise<NorthMemory[]> {
    const res = await this.request<NorthMemory[] | { ok: boolean; memories: NorthMemory[] }>('/api/ai/memory');
    if (Array.isArray(res)) return res;
    return res.memories || [];
  }

  public async saveMemory(data: {
    key?: string;
    conversationId?: string;
    question?: string;
    response?: string;
    value?: string;
    tags?: string[];
  }): Promise<unknown> {
    return await this.request<unknown>('/api/ai/memory', {
      method: 'POST',
      body: data,
    });
  }

  public async askAdvisor(question: string, history: unknown[] = []): Promise<unknown> {
    return await this.request<unknown>('/api/ai/advisor', {
      method: 'POST',
      body: { question, history },
      timeout: 30000,
    });
  }

  public async getEmergencyFundStatus(): Promise<NorthEmergencyFundStatus> {
    return await this.request<NorthEmergencyFundStatus>('/api/emergency-fund');
  }

  public async getSubscriptions(): Promise<NorthSubscription[]> {
    const res = await this.request<{ ok: boolean; subscriptions: NorthSubscription[] }>('/api/subscriptions');
    return res.subscriptions || [];
  }
}
