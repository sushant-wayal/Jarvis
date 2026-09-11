import { logger } from '@/lib/logging/logger';
import { SerenityAuth } from './SerenityAuth';

export interface SerenityJobStages {
  populateIdeas?: string;
  generateScript?: string;
  renderScenes?: string;
  generateVoiceover?: string;
  assembleLongForm?: string;
  generateThumbnail?: string;
  uploadYoutube?: string;
  shortsProcessing?: string;
}

export interface SerenityShortSummary {
  shortIndex: number;
  shortId: string;
  youtubeId?: string;
  videoUrl?: string;
  scheduledPublishTime?: string;
  rank?: number;
}

export interface SerenityPipelineStatus {
  overallStatus: 'running' | 'success' | 'failure' | string;
  ranAt?: string;
  runId?: string | number;
  videoId?: string;
  videoTitle?: string;
  youtubeId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  errorSummary?: string | null;
  sceneUrls?: string[];
  voiceoverUrls?: string[];
  sceneNarrations?: string[];
  shortHooks?: string[];
  shortCaptions?: string[];
  ideasAdded?: string[];
  shorts?: SerenityShortSummary[];
  jobs?: SerenityJobStages;
}

export interface SerenityRunHistoryItem {
  videoId: string;
  videoTitle: string;
  overallStatus: string;
  youtubeId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  ranAt: string;
  runId?: string | number;
  errorSummary?: string | null;
}

export interface SerenityAnalyticsVideo {
  videoId: string;
  title: string;
  views: number;
  impressions?: number;
  ctr?: number;
  averageViewDuration?: number;
  averageViewPercentage?: number;
  comments?: number;
  likes?: number;
  publishedAt?: string;
  isShort?: boolean;
}

export interface SerenityAnalytics {
  channel: {
    title: string;
    subscriberCount: number;
    viewCount: number;
    videoCount: number;
  };
  videoCount: number;
  recentVideos: SerenityAnalyticsVideo[];
}

export interface SerenityIdeasQueue {
  ideas: string[];
  count: number;
}

export interface SerenityEpisode {
  episodeId: string;
  topic: string;
  learningObjective?: string;
  difficulty?: string;
  estimatedDuration?: string;
  prerequisites?: string[];
  status?: string;
  videoId?: string;
}

export interface SerenitySeriesItem {
  id: string;
  title: string;
  learningGoal: string;
  status: 'active' | 'paused' | string;
  version?: number;
  priority?: number;
  uploadCount?: number;
  lastUploadTimestamp?: string;
  learningQueue?: SerenityEpisode[];
  history?: SerenityEpisode[];
}

export interface SerenityScheduleTimes {
  shortsTimes: string[];
  longFormTime: string;
}

export interface SerenitySettings {
  voiceoverProvider: 'gemini' | 'f5' | string;
  sceneRenderMethod: 'code' | 'ai' | string;
}

export interface SerenityScriptPreview {
  title: string;
  scenes: Array<{
    sceneIndex: number;
    narration: string;
    visualPrompt?: string;
    codeSnippet?: string;
  }>;
  shorts?: Array<{
    hook: string;
    caption: string;
  }>;
}

export interface SerenityThumbnailPreview {
  videoId: string;
  title: string;
  thumbnailUrl: string;
}

export class SerenityClient {
  private auth: SerenityAuth;
  private readonly defaultTimeoutMs = 15000;

  constructor(auth?: SerenityAuth) {
    this.auth = auth || new SerenityAuth();
  }

  public getAuth(): SerenityAuth {
    return this.auth;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const apiKey = this.auth.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Serenity authentication required. Please configure SERENITY_API_KEY.'
      );
    }

    const baseUrl = this.auth.getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const controller = new AbortController();
    const timeout = options.timeoutMs || this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'x-jarvis-key': apiKey,
      Authorization: `Bearer ${apiKey}`,
    };

    try {
      logger.info(`[SerenityClient] ${options.method || 'GET'} ${url}`);
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
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
          throw new Error(
            'Serenity authentication expired or API key invalid. Please reconnect your SERENITY_API_KEY.'
          );
        }
        if (response.status === 403) {
          throw new Error('Serenity API rate limit exceeded or access forbidden.');
        }
        if (response.status === 404) {
          throw new Error(`Serenity resource not found at ${endpoint}.`);
        }
        if (response.status === 422) {
          throw new Error(`Serenity unprocessable request: ${errorBodyText || response.statusText}`);
        }

        throw new Error(
          `Serenity API error (${response.status} ${response.statusText}): ${errorBodyText || 'Unknown error'}`
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Serenity API request to ${endpoint} timed out after ${timeout / 1000} seconds.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Read Operations ---

  public async getPipelineStatus(): Promise<SerenityPipelineStatus> {
    const res = await this.request<{ ok: boolean; status: SerenityPipelineStatus }>('/api/pipeline-status');
    return res.status;
  }

  public async getHistory(limit: number = 10): Promise<SerenityRunHistoryItem[]> {
    const res = await this.request<{ ok: boolean; runs: SerenityRunHistoryItem[] }>(
      `/api/history?limit=${Math.min(limit, 50)}`
    );
    return res.runs || [];
  }

  public async getAnalytics(daysBack: number = 30, limit: number = 10): Promise<SerenityAnalytics> {
    const res = await this.request<{ ok: boolean } & SerenityAnalytics>(
      `/api/analytics?daysBack=${daysBack}&limit=${limit}`
    );
    return {
      channel: res.channel,
      videoCount: res.videoCount,
      recentVideos: res.recentVideos || [],
    };
  }

  public async getIdeasQueue(): Promise<SerenityIdeasQueue> {
    const res = await this.request<{ ok: boolean; ideas: string[]; count: number }>('/api/ideas-queue');
    return {
      ideas: res.ideas || [],
      count: res.count ?? res.ideas?.length ?? 0,
    };
  }

  public async getSeries(): Promise<SerenitySeriesItem[]> {
    const res = await this.request<{ ok: boolean; series: SerenitySeriesItem[] }>('/api/series');
    return res.series || [];
  }

  public async getScheduleTimes(): Promise<SerenityScheduleTimes> {
    const res = await this.request<{ ok: boolean; shortsTimes: string[]; longFormTime: string }>(
      '/api/schedule-times'
    );
    return {
      shortsTimes: res.shortsTimes || [],
      longFormTime: res.longFormTime || '',
    };
  }

  public async getSettings(): Promise<SerenitySettings> {
    const res = await this.request<{ ok: boolean; voiceoverProvider: string; sceneRenderMethod: string }>(
      '/api/settings'
    );
    return {
      voiceoverProvider: res.voiceoverProvider,
      sceneRenderMethod: res.sceneRenderMethod,
    };
  }

  // --- Write Operations ---

  public async triggerVideoGeneration(videoIdea?: string): Promise<{ success: boolean; message: string; videoIdea?: string }> {
    return this.request<{ success: boolean; message: string; videoIdea?: string }>(
      '/api/trigger-youtube',
      {
        method: 'POST',
        body: videoIdea ? { videoIdea } : {},
      }
    );
  }

  public async retryFailedJobs(runId?: number | string): Promise<{ ok: boolean; message: string; runId?: number | string }> {
    return this.request<{ ok: boolean; message: string; runId?: number | string }>(
      '/api/rerun-failed-jobs',
      {
        method: 'POST',
        body: runId ? { runId: Number(runId) || runId } : {},
      }
    );
  }

  public async addIdea(idea: string): Promise<SerenityIdeasQueue> {
    const res = await this.request<{ ok: boolean; ideas: string[]; count: number }>(
      '/api/ideas-queue',
      {
        method: 'POST',
        body: { action: 'add', idea },
      }
    );
    return { ideas: res.ideas || [], count: res.count ?? res.ideas?.length ?? 0 };
  }

  public async reorderIdea(index: number, newIndex: number): Promise<SerenityIdeasQueue> {
    const res = await this.request<{ ok: boolean; ideas: string[]; count: number }>(
      '/api/ideas-queue',
      {
        method: 'POST',
        body: { action: 'move', index, newIndex },
      }
    );
    return { ideas: res.ideas || [], count: res.count ?? res.ideas?.length ?? 0 };
  }

  public async removeIdea(index: number): Promise<SerenityIdeasQueue> {
    const res = await this.request<{ ok: boolean; ideas: string[]; count: number }>(
      '/api/ideas-queue',
      {
        method: 'POST',
        body: { action: 'remove', index },
      }
    );
    return { ideas: res.ideas || [], count: res.count ?? res.ideas?.length ?? 0 };
  }

  public async clearIdeas(): Promise<SerenityIdeasQueue> {
    const res = await this.request<{ ok: boolean; ideas: string[]; count: number }>(
      '/api/ideas-queue',
      {
        method: 'POST',
        body: { action: 'clear' },
      }
    );
    return { ideas: res.ideas || [], count: res.count ?? res.ideas?.length ?? 0 };
  }

  public async createSeries(params: { id: string; title: string; learningGoal: string }): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/series/create', {
      method: 'POST',
      body: params,
    });
  }

  public async updateSeriesStatus(id: string, status: 'active' | 'paused'): Promise<{ ok: boolean; message?: string }> {
    return this.request<{ ok: boolean; message?: string }>('/api/series', {
      method: 'POST',
      body: { action: 'updateStatus', id, status },
    });
  }

  public async updateScheduleTimes(params: {
    shortsTimes?: string[];
    longFormTime?: string;
  }): Promise<SerenityScheduleTimes> {
    const res = await this.request<{ ok: boolean; shortsTimes: string[]; longFormTime: string }>(
      '/api/schedule-times',
      {
        method: 'POST',
        body: params,
      }
    );
    return {
      shortsTimes: res.shortsTimes || [],
      longFormTime: res.longFormTime || '',
    };
  }

  public async updateSettings(params: {
    voiceoverProvider?: 'gemini' | 'f5';
    sceneRenderMethod?: 'code' | 'ai';
  }): Promise<SerenitySettings> {
    const res = await this.request<{ ok: boolean; voiceoverProvider: string; sceneRenderMethod: string }>(
      '/api/settings',
      {
        method: 'POST',
        body: params,
      }
    );
    return {
      voiceoverProvider: res.voiceoverProvider,
      sceneRenderMethod: res.sceneRenderMethod,
    };
  }

  public async generateScriptPreview(params: {
    videoIdea: string;
    sceneRenderMethod?: 'code' | 'ai';
  }): Promise<SerenityScriptPreview> {
    const res = await this.request<{ script: SerenityScriptPreview }>('/api/generate-script', {
      method: 'POST',
      body: params,
      timeoutMs: 30000,
    });
    return res.script;
  }

  public async generateThumbnail(params: {
    videoId: string;
    title: string;
    narration?: string;
    tags?: string[];
    style?: string;
  }): Promise<SerenityThumbnailPreview> {
    const res = await this.request<SerenityThumbnailPreview>('/api/generate-thumbnail', {
      method: 'POST',
      body: params,
      timeoutMs: 30000,
    });
    return res;
  }
}
