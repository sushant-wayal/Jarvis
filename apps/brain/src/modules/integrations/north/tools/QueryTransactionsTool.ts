import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthTransaction } from '../NorthClient';

export class QueryTransactionsTool extends BaseIntegrationTool<
  {
    search?: string;
    category?: string;
    type?: 'income' | 'expense';
    dateRange?: 'today' | 'last7' | 'last30' | 'last90' | 'this_month' | 'last_month' | 'all';
    amountMin?: number;
    amountMax?: number;
    merchant?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  },
  {
    transactions: NorthTransaction[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    categories?: string[];
  }
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.query_transactions',
      name: 'north.query_transactions',
      description: 'Search and filter user transactions with pagination, categories, and date ranges.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        search: z.string().optional().describe('Search keyword in merchant or notes'),
        category: z.string().optional().describe('Category name (e.g. Food & Dining, Shopping)'),
        type: z.enum(['income', 'expense']).optional().describe('Filter by income or expense'),
        dateRange: z
          .enum(['today', 'last7', 'last30', 'last90', 'this_month', 'last_month', 'all'])
          .optional()
          .describe('Preset date window'),
        amountMin: z.number().nonnegative().optional().describe('Minimum transaction amount'),
        amountMax: z.number().positive().optional().describe('Maximum transaction amount'),
        merchant: z.string().optional().describe('Merchant or payee name'),
        page: z.number().int().positive().default(1).describe('Page number (default 1)'),
        pageSize: z.number().int().positive().max(100).default(20).describe('Items per page (default 20)'),
        sort: z.string().optional().describe('Sorting order, e.g. date:desc or amount:desc'),
      }),
      executor: async (input) => {
        const result = await client.queryTransactions(input);
        return {
          success: true,
          data: {
            transactions: result.data,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
            categories: result.categories,
          },
          message: `Found ${result.total} transactions (showing page ${result.page} of ${result.totalPages}).`,
        };
      },
    });
  }
}
