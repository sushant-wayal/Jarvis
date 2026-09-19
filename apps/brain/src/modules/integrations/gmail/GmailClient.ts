import { logger } from '@/lib/logging/logger';
import { GmailAuth } from './GmailAuth';

export interface GmailUserProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  labelIds: string[];
  unread: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  cc?: string;
  bcc?: string;
  body: string;
  isHtml: boolean;
  messageIdHeader?: string;
}

export interface GmailThreadSummary {
  id: string;
  snippet: string;
  historyId: string;
  messagesCount: number;
  messages?: GmailMessageSummary[];
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  isHtml?: boolean;
}

export interface SendEmailResult {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface DraftSummary {
  id: string;
  message: GmailMessageSummary;
}

export class GmailClient {
  private auth: GmailAuth;
  private baseUrl: string = 'https://gmail.googleapis.com/gmail/v1/users/me';

  constructor(auth?: GmailAuth | string) {
    if (typeof auth === 'string') {
      this.auth = new GmailAuth();
      this.auth.setToken(auth);
    } else {
      this.auth = auth || new GmailAuth();
    }
  }

  public getAuth(): GmailAuth {
    return this.auth;
  }

  public setToken(token: string): void {
    this.auth.setToken(token);
  }

  public hasToken(): boolean {
    return this.auth.isConfigured();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.auth.getAccessToken();
    if (!token) {
      throw new Error('Gmail integration is not configured. Please connect your Google account or provide a token.');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    };

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: options.signal || AbortSignal.timeout(15000),
        ...options,
        headers,
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Error(`Gmail API request to ${path} timed out after 15 seconds.`);
      }
      throw new Error(`Gmail network request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Auto-refresh token on 401 if refresh credentials exist
    if (response.status === 401) {
      const refreshed = await this.auth.refreshAccessToken();
      if (refreshed.success && this.auth.getAccessToken()) {
        headers['Authorization'] = `Bearer ${this.auth.getAccessToken()}`;
        response = await fetch(url, {
          signal: options.signal || AbortSignal.timeout(15000),
          ...options,
          headers,
        });
      } else {
        throw new Error('Gmail authentication expired or token invalid. Please reconnect your Gmail account.');
      }
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Gmail API access forbidden or quota exceeded. Verify app permissions and scopes.');
      }
      if (response.status === 404) {
        throw new Error(`Gmail resource not found at ${path}.`);
      }
      if (response.status === 429) {
        throw new Error('Gmail API rate limit exceeded. Please wait a moment before retrying.');
      }
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Gmail API error (HTTP ${response.status}): ${errorBody || response.statusText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  public async getProfile(): Promise<GmailUserProfile> {
    return this.request<GmailUserProfile>('/profile');
  }

  public async listEmails(options: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
    includeSpamTrash?: boolean;
  } = {}): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string; totalEstimated?: number }> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    if (options.maxResults) params.set('maxResults', String(Math.min(options.maxResults, 50)));
    if (options.pageToken) params.set('pageToken', options.pageToken);
    if (options.includeSpamTrash) params.set('includeSpamTrash', 'true');
    if (options.labelIds && options.labelIds.length > 0) {
      for (const label of options.labelIds) {
        params.append('labelIds', label);
      }
    }

    const path = `/messages?${params.toString()}`;
    const result = await this.request<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(path);

    if (!result.messages || result.messages.length === 0) {
      return { messages: [], nextPageToken: result.nextPageToken, totalEstimated: result.resultSizeEstimate };
    }

    // Fetch message summaries concurrently (capped at 15 for responsiveness)
    const messageDetails = await Promise.all(
      result.messages.slice(0, 15).map(async (m) => {
        try {
          return await this.getMessageSummary(m.id);
        } catch {
          return null;
        }
      })
    );

    return {
      messages: messageDetails.filter((m): m is GmailMessageSummary => m !== null),
      nextPageToken: result.nextPageToken,
      totalEstimated: result.resultSizeEstimate,
    };
  }

  public async getEmail(id: string): Promise<GmailMessageDetail> {
    const raw = await this.request<any>(`/messages/${id}?format=full`);
    return this.parseFullMessage(raw);
  }

  private async getMessageSummary(id: string): Promise<GmailMessageSummary> {
    const raw = await this.request<any>(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);
    const headers = this.extractHeaders(raw.payload?.headers || []);
    return {
      id: raw.id,
      threadId: raw.threadId,
      subject: headers['subject'] || '(No Subject)',
      from: headers['from'] || '',
      to: headers['to'] || '',
      date: headers['date'] || '',
      snippet: raw.snippet || '',
      labelIds: raw.labelIds || [],
      unread: (raw.labelIds || []).includes('UNREAD'),
    };
  }

  public async listThreads(options: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<{ threads: GmailThreadSummary[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    if (options.maxResults) params.set('maxResults', String(Math.min(options.maxResults, 20)));
    if (options.pageToken) params.set('pageToken', options.pageToken);
    if (options.labelIds && options.labelIds.length > 0) {
      for (const label of options.labelIds) {
        params.append('labelIds', label);
      }
    }

    const path = `/threads?${params.toString()}`;
    const result = await this.request<{
      threads?: Array<{ id: string; snippet: string; historyId: string }>;
      nextPageToken?: string;
    }>(path);

    if (!result.threads || result.threads.length === 0) {
      return { threads: [], nextPageToken: result.nextPageToken };
    }

    return {
      threads: result.threads.map((t) => ({
        id: t.id,
        snippet: t.snippet || '',
        historyId: t.historyId,
        messagesCount: 1,
      })),
      nextPageToken: result.nextPageToken,
    };
  }

  public async getThread(id: string): Promise<GmailThreadSummary> {
    const raw = await this.request<any>(`/threads/${id}?format=full`);
    const messages = (raw.messages || []).map((m: any) => {
      const headers = this.extractHeaders(m.payload?.headers || []);
      return {
        id: m.id,
        threadId: m.threadId,
        subject: headers['subject'] || '(No Subject)',
        from: headers['from'] || '',
        to: headers['to'] || '',
        date: headers['date'] || '',
        snippet: m.snippet || '',
        labelIds: m.labelIds || [],
        unread: (m.labelIds || []).includes('UNREAD'),
      };
    });

    return {
      id: raw.id,
      snippet: messages[0]?.snippet || '',
      historyId: raw.historyId,
      messagesCount: messages.length,
      messages,
    };
  }

  public async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const rawMime = this.buildMimeMessage(params);
    const body: Record<string, unknown> = { raw: rawMime };
    if (params.threadId) {
      body.threadId = params.threadId;
    }

    return this.request<SendEmailResult>('/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  public async createDraft(params: SendEmailParams): Promise<DraftSummary> {
    const rawMime = this.buildMimeMessage(params);
    const body: Record<string, unknown> = {
      message: {
        raw: rawMime,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      },
    };

    const draft = await this.request<any>('/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      id: draft.id,
      message: {
        id: draft.message?.id || draft.id,
        threadId: draft.message?.threadId || '',
        subject: params.subject,
        from: '',
        to: params.to,
        date: new Date().toISOString(),
        snippet: params.body.slice(0, 100),
        labelIds: draft.message?.labelIds || ['DRAFT'],
        unread: false,
      },
    };
  }

  public async listDrafts(options: { maxResults?: number; pageToken?: string } = {}): Promise<{ drafts: DraftSummary[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    if (options.maxResults) params.set('maxResults', String(Math.min(options.maxResults, 20)));
    if (options.pageToken) params.set('pageToken', options.pageToken);

    const result = await this.request<any>(`/drafts?${params.toString()}`);
    const drafts = (result.drafts || []).map((d: any) => {
      const headers = this.extractHeaders(d.message?.payload?.headers || []);
      return {
        id: d.id,
        message: {
          id: d.message?.id || d.id,
          threadId: d.message?.threadId || '',
          subject: headers['subject'] || '(Draft)',
          from: headers['from'] || '',
          to: headers['to'] || '',
          date: headers['date'] || '',
          snippet: d.message?.snippet || '',
          labelIds: d.message?.labelIds || ['DRAFT'],
          unread: false,
        },
      };
    });

    return { drafts, nextPageToken: result.nextPageToken };
  }

  public async replyEmail(params: {
    threadId: string;
    messageId: string;
    to: string;
    subject: string;
    body: string;
    cc?: string;
    isHtml?: boolean;
  }): Promise<SendEmailResult> {
    const originalMessage = await this.getEmail(params.messageId);
    const inReplyTo = originalMessage.messageIdHeader || `<${params.messageId}@mail.gmail.com>`;
    const normalizedSubject = params.subject.toLowerCase().startsWith('re:') ? params.subject : `Re: ${params.subject}`;

    return this.sendEmail({
      to: params.to,
      subject: normalizedSubject,
      body: params.body,
      cc: params.cc,
      threadId: params.threadId,
      inReplyTo,
      references: inReplyTo,
      isHtml: params.isHtml,
    });
  }

  public async modifyEmailLabels(id: string, addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<{ id: string; labelIds: string[] }> {
    return this.request<{ id: string; labelIds: string[] }>(`/messages/${id}/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }

  public async trashEmail(id: string): Promise<{ id: string; threadId: string }> {
    return this.request<{ id: string; threadId: string }>(`/messages/${id}/trash`, {
      method: 'POST',
    });
  }

  private buildMimeMessage(params: SendEmailParams): string {
    const encodedSubject = `=?utf-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`;
    const lines = [
      `To: ${params.to}`,
      params.cc ? `Cc: ${params.cc}` : null,
      params.bcc ? `Bcc: ${params.bcc}` : null,
      `Subject: ${encodedSubject}`,
      params.inReplyTo ? `In-Reply-To: ${params.inReplyTo}` : null,
      params.references ? `References: ${params.references}` : null,
      'MIME-Version: 1.0',
      `Content-Type: ${params.isHtml ? 'text/html' : 'text/plain'}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(params.body, 'utf-8').toString('base64'),
    ]
      .filter((l): l is string => l !== null)
      .join('\r\n');

    return Buffer.from(lines, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private parseFullMessage(raw: any): GmailMessageDetail {
    const headers = this.extractHeaders(raw.payload?.headers || []);
    const { body, isHtml } = this.extractBody(raw.payload);

    return {
      id: raw.id,
      threadId: raw.threadId,
      subject: headers['subject'] || '(No Subject)',
      from: headers['from'] || '',
      to: headers['to'] || '',
      cc: headers['cc'],
      bcc: headers['bcc'],
      date: headers['date'] || '',
      snippet: raw.snippet || '',
      labelIds: raw.labelIds || [],
      unread: (raw.labelIds || []).includes('UNREAD'),
      messageIdHeader: headers['message-id'],
      body: body || raw.snippet || '',
      isHtml,
    };
  }

  private extractHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
    const map: Record<string, string> = {};
    for (const h of headers) {
      map[h.name.toLowerCase()] = h.value;
    }
    return map;
  }

  private extractBody(payload: any): { body: string; isHtml: boolean } {
    if (!payload) return { body: '', isHtml: false };

    if (payload.body?.data) {
      const decoded = this.decodeBase64Url(payload.body.data);
      const isHtml = payload.mimeType === 'text/html';
      return { body: decoded, isHtml };
    }

    if (payload.parts && Array.isArray(payload.parts)) {
      // Look for text/plain part first, fallback to text/html
      const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (plainPart?.body?.data) {
        return { body: this.decodeBase64Url(plainPart.body.data), isHtml: false };
      }

      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        return { body: this.decodeBase64Url(htmlPart.body.data), isHtml: true };
      }

      // Check sub-parts for multipart/alternative
      for (const part of payload.parts) {
        if (part.parts) {
          const sub = this.extractBody(part);
          if (sub.body) return sub;
        }
      }
    }

    return { body: '', isHtml: false };
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}
