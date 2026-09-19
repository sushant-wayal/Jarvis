import { ToolContext } from '@jarvis/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gmailIntegration, GmailIntegration } from '../modules/integrations/gmail/GmailIntegration';
import { GmailClient } from '../modules/integrations/gmail/GmailClient';
import { GmailAuth } from '../modules/integrations/gmail/GmailAuth';
import { integrationManager } from '../modules/integrations/integration-manager';
import { toolRegistry } from '../modules/tools/registry';

describe('Gmail Integration', () => {
  const dummyContext: ToolContext = {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'req-1',
    timezone: 'UTC',
    locale: 'en-US',
  };

  beforeEach(async () => {
    integrationManager.register(gmailIntegration);
    await gmailIntegration.enable();
  });

  describe('Lifecycle & Dynamic Discovery', () => {
    it('registers with correct metadata', () => {
      expect(gmailIntegration.metadata.id).toBe('gmail');
      expect(gmailIntegration.metadata.name).toBe('Gmail');
      expect(gmailIntegration.metadata.version).toBe('1.0.0');
      expect(gmailIntegration.metadata.permissions).toContain('https://mail.google.com/');
    });

    it('exposes all 10 Gmail tools through IntegrationManager and ToolRegistry', () => {
      const allTools = toolRegistry.getAllTools();
      const toolNames = allTools.map((t) => t.name);

      expect(toolNames).toContain('gmail.list_emails');
      expect(toolNames).toContain('gmail.get_email');
      expect(toolNames).toContain('gmail.list_threads');
      expect(toolNames).toContain('gmail.get_thread');
      expect(toolNames).toContain('gmail.send_email');
      expect(toolNames).toContain('gmail.create_draft');
      expect(toolNames).toContain('gmail.reply_email');
      expect(toolNames).toContain('gmail.modify_labels');
      expect(toolNames).toContain('gmail.trash_email');
      expect(toolNames).toContain('gmail.get_profile');
    });

    it('generates Gemini-safe declarations with underscores', () => {
      const declarations = toolRegistry.getGeminiFunctionDeclarations();
      const decNames = declarations.map((d) => d.name);

      expect(decNames).toContain('gmail_list_emails');
      expect(decNames).toContain('gmail_send_email');
      expect(decNames).toContain('gmail_get_email');
      expect(decNames).toContain('gmail_trash_email');
    });

    it('removes Gmail tools when integration is disabled', async () => {
      await gmailIntegration.disable();

      const activeTools = integrationManager.getAllActiveTools();
      const activeIds = activeTools.map((t) => t.id);
      expect(activeIds).not.toContain('gmail.send_email');
      expect(activeIds).not.toContain('gmail.list_emails');

      const status = await gmailIntegration.getStatus();
      expect(status).toBe('DISABLED');

      // Re-enable for subsequent tests
      await gmailIntegration.enable();
    });

    it('authenticates and disconnects credentials cleanly', async () => {
      const integration = new GmailIntegration();
      expect(await integration.getStatus()).toBe('CONFIG_REQUIRED');

      const success = await integration.authenticate({ token: 'test-oauth-token' });
      expect(success).toBe(true);
      expect(await integration.getStatus()).toBe('ENABLED');

      await integration.disconnect();
      expect(await integration.getStatus()).toBe('CONFIG_REQUIRED');
    });
  });

  describe('Tool Risk Levels & Confirmation Guardrails (Workspace Rule 12)', () => {
    it('enforces confirmation on send_email (EXTERNAL_ACTION, HIGH_RISK)', () => {
      const tool = gmailIntegration.getTool('gmail.send_email');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.actionType).toBe('EXTERNAL_ACTION');
      expect(tool?.riskLevel).toBe('HIGH_RISK');
    });

    it('enforces confirmation on reply_email (EXTERNAL_ACTION, HIGH_RISK)', () => {
      const tool = gmailIntegration.getTool('gmail.reply_email');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.actionType).toBe('EXTERNAL_ACTION');
      expect(tool?.riskLevel).toBe('HIGH_RISK');
    });

    it('enforces confirmation on trash_email (DESTRUCTIVE, HIGH_RISK)', () => {
      const tool = gmailIntegration.getTool('gmail.trash_email');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(true);
      expect(tool?.actionType).toBe('DESTRUCTIVE');
      expect(tool?.riskLevel).toBe('HIGH_RISK');
    });

    it('allows create_draft as LOW_RISK WRITE without confirmation', () => {
      const tool = gmailIntegration.getTool('gmail.create_draft');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
      expect(tool?.actionType).toBe('WRITE');
      expect(tool?.riskLevel).toBe('LOW_RISK');
    });

    it('allows modify_labels as LOW_RISK WRITE without confirmation', () => {
      const tool = gmailIntegration.getTool('gmail.modify_labels');
      expect(tool).toBeDefined();
      expect(tool?.requiresConfirmation).toBe(false);
      expect(tool?.actionType).toBe('WRITE');
      expect(tool?.riskLevel).toBe('LOW_RISK');
    });

    it('allows read-only operations as SAFE without confirmation', () => {
      for (const id of ['gmail.list_emails', 'gmail.get_email', 'gmail.list_threads', 'gmail.get_thread', 'gmail.get_profile']) {
        const tool = gmailIntegration.getTool(id);
        expect(tool).toBeDefined();
        expect(tool?.requiresConfirmation).toBe(false);
        expect(tool?.actionType).toBe('READ');
        expect(tool?.riskLevel).toBe('SAFE');
      }
    });
  });

  describe('Tool Execution with Mocked Client', () => {
    let mockClient: GmailClient;
    let integration: GmailIntegration;

    beforeEach(() => {
      mockClient = new GmailClient('mock-token');
      integration = new GmailIntegration(mockClient);
    });

    it('executes list_emails successfully', async () => {
      vi.spyOn(mockClient, 'listEmails').mockResolvedValueOnce({
        messages: [
          {
            id: 'msg_123',
            threadId: 'th_123',
            subject: 'Project Update',
            from: 'sarah@company.com',
            to: 'me@company.com',
            date: '2026-09-19',
            snippet: 'Here is the summary of sprint progress...',
            labelIds: ['INBOX', 'UNREAD'],
            unread: true,
          },
        ],
        totalEstimated: 1,
      });

      const tool = integration.getTool('gmail.list_emails')!;
      const result = await tool.execute({ query: 'is:unread', maxResults: 5 }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any).messages).toHaveLength(1);
      expect((result.data as any).messages[0].subject).toBe('Project Update');
      expect(result.message).toContain('Found 1 email(s)');
    });

    it('executes get_email successfully', async () => {
      vi.spyOn(mockClient, 'getEmail').mockResolvedValueOnce({
        id: 'msg_123',
        threadId: 'th_123',
        subject: 'Flight Confirmation',
        from: 'airline@booking.com',
        to: 'me@example.com',
        date: '2026-09-19',
        snippet: 'Your flight is confirmed.',
        labelIds: ['INBOX'],
        unread: false,
        body: 'Booking Reference: ABCDEF. Departure: 10:00 AM.',
        isHtml: false,
      });

      const tool = integration.getTool('gmail.get_email')!;
      const result = await tool.execute({ id: 'msg_123' }, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any).subject).toBe('Flight Confirmation');
      expect((result.data as any).body).toContain('Booking Reference: ABCDEF');
      expect(result.message).toContain('Flight Confirmation');
    });

    it('executes send_email successfully', async () => {
      vi.spyOn(mockClient, 'sendEmail').mockResolvedValueOnce({
        id: 'msg_sent_999',
        threadId: 'th_999',
        labelIds: ['SENT'],
      });

      const tool = integration.getTool('gmail.send_email')!;
      const result = await tool.execute(
        {
          to: 'colleague@example.com',
          subject: 'Review Request',
          body: 'Please review the pull request when you have time.',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('msg_sent_999');
      expect(result.message).toContain('Successfully sent email to "colleague@example.com"');
    });

    it('executes create_draft successfully', async () => {
      vi.spyOn(mockClient, 'createDraft').mockResolvedValueOnce({
        id: 'draft_777',
        message: {
          id: 'msg_777',
          threadId: 'th_777',
          subject: 'Draft Meeting Notes',
          from: '',
          to: 'team@example.com',
          date: '2026-09-19',
          snippet: 'Agenda items...',
          labelIds: ['DRAFT'],
          unread: false,
        },
      });

      const tool = integration.getTool('gmail.create_draft')!;
      const result = await tool.execute(
        {
          to: 'team@example.com',
          subject: 'Draft Meeting Notes',
          body: 'Agenda items for Monday sync.',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('draft_777');
      expect(result.message).toContain('Created draft email');
    });

    it('executes reply_email successfully', async () => {
      vi.spyOn(mockClient, 'replyEmail').mockResolvedValueOnce({
        id: 'reply_555',
        threadId: 'th_123',
      });

      const tool = integration.getTool('gmail.reply_email')!;
      const result = await tool.execute(
        {
          threadId: 'th_123',
          messageId: 'msg_123',
          to: 'boss@example.com',
          subject: 'Re: Budget proposal',
          body: 'Looks good to me. Proceeding with phase 1.',
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('reply_555');
      expect(result.message).toContain('Successfully replied to email thread th_123');
    });

    it('executes modify_labels successfully', async () => {
      vi.spyOn(mockClient, 'modifyEmailLabels').mockResolvedValueOnce({
        id: 'msg_123',
        labelIds: ['STARRED', 'INBOX'],
      });

      const tool = integration.getTool('gmail.modify_labels')!;
      const result = await tool.execute(
        {
          id: 'msg_123',
          addLabelIds: ['STARRED'],
          removeLabelIds: ['UNREAD'],
        },
        dummyContext
      );

      expect(result.success).toBe(true);
      expect((result.data as any).labelIds).toContain('STARRED');
      expect(result.message).toContain('Successfully updated labels');
    });

    it('executes trash_email successfully', async () => {
      vi.spyOn(mockClient, 'trashEmail').mockResolvedValueOnce({
        id: 'msg_123',
        threadId: 'th_123',
      });

      const tool = integration.getTool('gmail.trash_email')!;
      const result = await tool.execute({ id: 'msg_123' }, dummyContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully moved email msg_123 to trash');
    });

    it('executes get_profile successfully', async () => {
      vi.spyOn(mockClient, 'getProfile').mockResolvedValueOnce({
        emailAddress: 'user@gmail.com',
        messagesTotal: 1542,
        threadsTotal: 890,
        historyId: 'hist_9988',
      });

      const tool = integration.getTool('gmail.get_profile')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(true);
      expect((result.data as any).emailAddress).toBe('user@gmail.com');
      expect(result.message).toContain('Connected to Gmail account: user@gmail.com');
    });
  });

  describe('Input Validation & Error Translation', () => {
    let mockClient: GmailClient;
    let integration: GmailIntegration;

    beforeEach(() => {
      mockClient = new GmailClient('mock-token');
      integration = new GmailIntegration(mockClient);
    });

    it('fails on invalid recipient email format in send_email', async () => {
      const tool = integration.getTool('gmail.send_email')!;
      const result = await tool.execute(
        {
          to: 'not-an-email',
          subject: 'Test',
          body: 'Hello',
        },
        dummyContext
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMETERS');
    });

    it('handles Gmail 401 unauthenticated errors gracefully', async () => {
      vi.spyOn(mockClient, 'listEmails').mockRejectedValueOnce(
        new Error('Gmail authentication expired or token invalid. Please reconnect your Gmail account.')
      );

      const tool = integration.getTool('gmail.list_emails')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Gmail authentication expired');
    });

    it('handles Gmail 403 quota / permission errors gracefully', async () => {
      vi.spyOn(mockClient, 'sendEmail').mockRejectedValueOnce(
        new Error('Gmail API access forbidden or quota exceeded. Verify app permissions and scopes.')
      );

      const tool = integration.getTool('gmail.send_email')!;
      const result = await tool.execute(
        {
          to: 'test@example.com',
          subject: 'Hi',
          body: 'Test',
        },
        dummyContext
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('access forbidden or quota exceeded');
    });

    it('handles Gmail 404 resource not found gracefully', async () => {
      vi.spyOn(mockClient, 'getEmail').mockRejectedValueOnce(
        new Error('Gmail resource not found at /messages/unknown_id.')
      );

      const tool = integration.getTool('gmail.get_email')!;
      const result = await tool.execute({ id: 'unknown_id' }, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Gmail resource not found');
    });

    it('handles request timeout errors gracefully', async () => {
      vi.spyOn(mockClient, 'listEmails').mockRejectedValueOnce(
        new Error('Gmail API request to /messages timed out after 15 seconds.')
      );

      const tool = integration.getTool('gmail.list_emails')!;
      const result = await tool.execute({}, dummyContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out after 15 seconds');
    });
  });

  describe('Auth Lifecycle & Token Validation', () => {
    it('validates token successfully when profile endpoint responds', async () => {
      const auth = new GmailAuth();
      auth.setToken('valid-token');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ emailAddress: 'user@example.com' }),
      } as Response);

      const result = await auth.validateToken();
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('returns valid=false on network or 401 error', async () => {
      const auth = new GmailAuth();
      auth.setToken('bad-token');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const result = await auth.validateToken();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Gmail token verification failed: HTTP 401');
    });
  });
});
