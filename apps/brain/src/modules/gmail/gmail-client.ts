import { google } from 'googleapis';

export class GmailClient {
  private auth: any;

  constructor(credentials: { clientId: string; clientSecret: string; redirectUri: string; refreshToken: string }) {
    this.auth = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );
    this.auth.setCredentials({ refresh_token: credentials.refreshToken });
  }

  async listMessages(maxResults: number = 10) {
    const gmail = google.gmail({ version: 'v1', auth: this.auth });
    const res = await gmail.users.messages.list({ userId: 'me', maxResults });
    return res.data.messages || [];
  }

  async getMessage(id: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.auth });
    const res = await gmail.users.messages.get({ userId: 'me', id });
    return res.data;
  }
}
