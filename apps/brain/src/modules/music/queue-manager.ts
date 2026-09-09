import { MusicSession, QueuedTrack, normalizeSongTitle } from './music-types';
import { autoplayEngine } from './autoplay-engine';
import { logger } from '@/lib/logging/logger';

export class QueueManager {
  /**
   * Ensures the session queue has at least `targetCount` upcoming tracks.
   * Fetches new recommendations asynchronously when below threshold.
   */
  async replenishQueue(
    session: MusicSession,
    targetCount = 5,
    conversationId?: string,
    timezone?: string
  ): Promise<QueuedTrack[]> {
    const needed = targetCount - session.queue.length;
    if (needed <= 0) {
      return session.queue;
    }

    try {
      const newTracks = await autoplayEngine.recommendNextTracks({
        userId: session.userId,
        intent: session.musicIntent,
        currentTrack: session.currentTrack,
        seedTrack: session.seedTrack,
        playbackHistory: session.playbackHistory,
        conversationId,
        timezone,
        count: Math.max(3, needed + 2),
      });

      const existingIds = new Set([
        ...(session.currentTrack ? [session.currentTrack.id] : []),
        ...session.queue.map((t) => t.id),
        ...session.playbackHistory.slice(-20).map((t) => t.id),
      ]);

      const existingTitles = new Set([
        ...(session.currentTrack ? [normalizeSongTitle(session.currentTrack.title)] : []),
        ...session.queue.map((t) => normalizeSongTitle(t.title)),
        ...session.playbackHistory.slice(-20).map((t) => normalizeSongTitle(t.title)),
      ]);

      const existingUrls = new Set([
        ...(session.currentTrack?.audioUrl ? [session.currentTrack.audioUrl] : []),
        ...session.queue.map((t) => t.audioUrl).filter(Boolean),
        ...session.playbackHistory.slice(-20).map((t) => t.audioUrl).filter(Boolean),
      ]);

      const distinctNew: QueuedTrack[] = [];
      for (const t of newTracks) {
        const norm = normalizeSongTitle(t.title);
        if (existingIds.has(t.id)) continue;
        if (norm && existingTitles.has(norm)) continue;
        if (t.audioUrl && existingUrls.has(t.audioUrl)) continue;

        existingIds.add(t.id);
        if (norm) existingTitles.add(norm);
        if (t.audioUrl) existingUrls.add(t.audioUrl);
        distinctNew.push(t);
      }

      session.queue.push(...distinctNew);
      session.updatedAt = Date.now();

      logger.info('Replenished music session queue', {
        sessionId: session.sessionId,
        addedCount: distinctNew.length,
        totalQueueLength: session.queue.length,
      });
    } catch (err) {
      logger.error('Failed to replenish music queue', { sessionId: session.sessionId, err });
    }

    return session.queue;
  }

  /**
   * Advances the session queue: pushes currentTrack to playbackHistory
   * and shifts the first track from queue to become currentTrack.
   */
  advance(session: MusicSession): QueuedTrack | null {
    if (session.currentTrack) {
      session.playbackHistory.push(session.currentTrack);
      if (session.playbackHistory.length > 50) {
        session.playbackHistory.shift();
      }
    }

    const nextTrack = session.queue.shift() || null;
    session.currentTrack = nextTrack;
    session.updatedAt = Date.now();

    if (nextTrack) {
      session.status = 'PLAYING';
    } else {
      session.status = 'IDLE';
    }

    return nextTrack;
  }

  /**
   * Flushes upcoming tracks when user updates the session intent,
   * while keeping the current playing track intact.
   */
  flushUpcoming(session: MusicSession): void {
    session.queue = [];
    session.updatedAt = Date.now();
  }
}

export const queueManager = new QueueManager();
