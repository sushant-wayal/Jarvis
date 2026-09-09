import { randomUUID } from 'crypto';
import {
  MusicIntent,
  MusicMode,
  MusicSession,
  PlaybackEvent,
  QueuedTrack,
} from './music-types';
import { queueManager } from './queue-manager';
import { preferenceLearner } from './preference-learner';
import { musicContextProvider } from './context-provider';
import { expandMusicIntent } from './music-intent-expander';
import { resolveMusicTrack } from '@/modules/media/music-resolver';
import { logger } from '@/lib/logging/logger';

export class MusicSessionManager {
  private sessions = new Map<string, MusicSession>();
  private userActiveSession = new Map<string, string>(); // userId -> sessionId

  /**
   * Creates or resets an active music session for a user.
   */
  async createSession(params: {
    userId: string;
    query?: string;
    mode?: MusicMode;
    intent?: MusicIntent;
    seedTrack?: QueuedTrack;
    conversationId?: string;
    timezone?: string;
  }): Promise<MusicSession> {
    const {
      userId,
      query,
      mode = 'AUTOPLAY',
      intent = {},
      seedTrack: preResolvedSeed,
      conversationId,
      timezone,
    } = params;

    const sessionId = randomUUID();
    const effectiveIntent: MusicIntent = {
      ...intent,
      query: query || intent.query,
    };

    // Expand intent for ambient, activity, or mood contexts
    const soundscape = expandMusicIntent(effectiveIntent);
    if (soundscape.isAmbientOrActivity && !effectiveIntent.energy) {
      effectiveIntent.energy = soundscape.targetEnergy;
    }

    let seedTrack: QueuedTrack | null = preResolvedSeed || null;

    // 1. Resolve seed track if not pre-resolved
    if (!seedTrack) {
      const resolveQuery = soundscape.isAmbientOrActivity
        ? soundscape.primaryQuery
        : (effectiveIntent.query || soundscape.primaryQuery);

      if (resolveQuery) {
        const resolved = await resolveMusicTrack(resolveQuery);
        if (resolved.success && resolved.audioUrl) {
          seedTrack = {
            id: randomUUID(),
            title: resolved.title,
            artist: resolved.artist,
            audioUrl: resolved.audioUrl,
            artworkUrl: resolved.artworkUrl,
            duration: resolved.duration,
            source: resolved.source,
            videoId: resolved.videoId,
            explanation: soundscape.isAmbientOrActivity ? soundscape.explanation : 'User requested track',
          };
        }
      }
    }

    // 2. Capture context snapshot
    const contextSnapshot = await musicContextProvider.getContextSnapshot(
      userId,
      conversationId,
      timezone
    );

    const session: MusicSession = {
      sessionId,
      userId,
      mode,
      status: 'STARTING',
      currentTrack: seedTrack,
      queue: [],
      playbackHistory: [],
      seedTrack: seedTrack || undefined,
      musicIntent: effectiveIntent,
      autoplayEnabled: mode !== 'SINGLE',
      contextSnapshot,
      sessionStartedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.userActiveSession.set(userId, sessionId);

    // 3. Immediately prefetch & buffer upcoming queue if autoplay is enabled
    if (session.autoplayEnabled) {
      session.status = 'GENERATING_QUEUE';
      await queueManager.replenishQueue(session, 5, conversationId, timezone);
      session.status = 'PLAYING';
    }

    logger.info('Created new MusicSession', {
      sessionId,
      userId,
      mode,
      seedTitle: seedTrack?.title,
      queuedCount: session.queue.length,
    });

    return session;
  }

  getSession(sessionId: string): MusicSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessionForUser(userId: string): MusicSession | undefined {
    const sessionId = this.userActiveSession.get(userId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Conversational session intent update (e.g. "make it chill", "more Hindi songs", "surprise me").
   * Flushes pending queue and refills with new intent without stopping current playback.
   */
  async updateIntent(
    sessionId: string,
    updatedIntent: Partial<MusicIntent>,
    conversationId?: string,
    timezone?: string
  ): Promise<MusicSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.musicIntent = {
      ...session.musicIntent,
      ...updatedIntent,
    };

    // Flush upcoming queue and regenerate based on updated intent
    queueManager.flushUpcoming(session);
    await queueManager.replenishQueue(session, 5, conversationId, timezone);

    logger.info('Updated MusicSession intent', {
      sessionId,
      newIntent: session.musicIntent,
      newQueueLength: session.queue.length,
    });

    return session;
  }

  /**
   * Advances the playback queue.
   */
  async advanceTrack(sessionId: string): Promise<QueuedTrack | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const nextTrack = queueManager.advance(session);

    // Trigger non-blocking replenishment if queue is low
    if (session.autoplayEnabled && session.queue.length < 3) {
      void queueManager.replenishQueue(session, 5);
    }

    return nextTrack;
  }

  /**
   * Ingests a playback event from the mobile client.
   */
  async handlePlaybackEvent(event: PlaybackEvent): Promise<void> {
    const session = this.sessions.get(event.sessionId);
    if (session) {
      session.updatedAt = Date.now();
      if (event.eventType === 'PLAY_COMPLETED' && session.autoplayEnabled) {
        // Automatically ensure queue is healthy
        if (session.queue.length < 3) {
          void queueManager.replenishQueue(session, 5);
        }
      }
    }

    const userId = session?.userId || 'default-user';
    await preferenceLearner.processEvent(userId, event);
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'STOPPED';
      session.autoplayEnabled = false;
      session.updatedAt = Date.now();
    }
  }
}

export const musicSessionManager = new MusicSessionManager();
