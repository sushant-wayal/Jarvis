import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { NorthClient, NorthTransaction } from '../NorthClient';

export class AddTransactionTool extends BaseIntegrationTool<
  {
    amount: number;
    merchant: string;
    transactionType: 'EXPENSE' | 'INCOME' | 'TRANSFER';
    category?: string;
    paymentMethod?: string;
    bankName?: string;
    notes?: string;
    timestamp?: string;
  },
  NorthTransaction
> {
  constructor(client: NorthClient) {
    super({
      id: 'north.add_transaction',
      name: 'north.add_transaction',
      description: 'Log a new transaction (expense, income, or transfer) into North personal financial advisor.',
      integrationId: 'north',
      category: 'FINANCE',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      permissions: ['financial:write'],
      inputSchema: z.object({
        amount: z.number().positive().describe('Transaction amount in INR'),
        merchant: z.string().min(1).describe('Merchant or payee name (e.g. Starbucks, Amazon India, Employer)'),
        transactionType: z
          .enum(['EXPENSE', 'INCOME', 'TRANSFER'])
          .default('EXPENSE')
          .describe('Transaction type (EXPENSE, INCOME, or TRANSFER)'),
        category: z.string().optional().describe('Category name (e.g. Groceries, Food & Dining, Salary)'),
        paymentMethod: z.string().optional().describe('Payment method (e.g. UPI, Credit Card, Debit Card, Cash)'),
        bankName: z.string().optional().describe('Associated bank name (e.g. HDFC Bank, ICICI Bank)'),
        notes: z.string().optional().describe('Optional notes or description'),
        timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to current time)'),
      }),
      executor: async (input) => {
        const transaction = await client.addTransaction(input);
        return {
          success: true,
          data: transaction,
          message: `Recorded ${input.transactionType.toLowerCase()} of ₹${input.amount.toLocaleString('en-IN')} for "${input.merchant}".`,
        };
      },
    });
  }
}
