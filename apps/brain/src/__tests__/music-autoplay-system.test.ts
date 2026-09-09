import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RecommendationRanker } from '../modules/music/recommendation-ranker';
import { DiversityController } from '../modules/music/diversity-controller';
import { PreferenceLearner } from '../modules/music/preference-learner';
import { QueueManager } from '../modules/music/queue-manager';
import { MusicSessionManager } from '../modules/music/music-session-manager';
import { MusicContextProvider } from '../modules/music/context-provider';
import { CandidateTrack, MusicIntent, MusicProfile, MusicSession, QueuedTrack } from '../modules/music/music-types';

describe('Intelligent Music Autoplay & Personal Radio System', () => {
  // ── 1. Recommendation Scoring & Ranker ──────────────────────────────────────
  describe('Recommendation Ranker', () => {
    const ranker = new RecommendationRanker();

    const baseProfile: MusicProfile = {
      likedTracks: ['blinding lights'],
      dislikedTracks: ['bad song'],
      dislikedArtists: ['bad artist'],
      artistAffinity: { 'the weeknd': 0.8, 'arijit singh': -0.4 },
      genreAffinity: { 'pop': 0.6, 'lofi': 0.3 },
      languageAffinity: { 'english': 0.7, 'hindi': 0.5 },
      skipHistory: [{ trackId: 'skip-1', artist: 'Skip Artist', timestamp: Date.now(), percentage: 5 }],
      completionHistory: [],
      recentlyPlayedTracks: [{ id: 'recent-1', title: 'Starboy', artist: 'The Weeknd', timestamp: Date.now() }],
      explorationPreference: 'MEDIUM',
      preferredEnergy: 'medium',
      preferredMoods: ['chill'],
    };

    it('hard-filters disliked tracks and disliked artists', () => {
      const candidates: CandidateTrack[] = [
        { id: '1', title: 'Bad Song', artist: 'Some Artist', source: 'catalog' },
        { id: '2', title: 'Good Song', artist: 'Bad Artist', source: 'catalog' },
        { id: '3', title: 'Save Your Tears', artist: 'The Weeknd', source: 'catalog' },
      ];

      const ranked = ranker.rank({
        candidates,
        intent: {},
        profile: baseProfile,
      });

      expect(ranked).toHaveLength(1);
      expect(ranked[0].track.title).toBe('Save Your Tears');
    });

    it('penalizes recently played tracks and recently skipped tracks', () => {
      const candidates: CandidateTrack[] = [
        { id: 'recent-1', title: 'Starboy', artist: 'The Weeknd', source: 'catalog' },
        { id: 'skip-1', title: 'Skipped Track', artist: 'Skip Artist', source: 'catalog' },
        { id: 'fresh-1', title: 'In Your Eyes', artist: 'The Weeknd', source: 'catalog' },
      ];

      const ranked = ranker.rank({
        candidates,
        intent: {},
        profile: baseProfile,
      });

      const freshRank = ranked.find((r) => r.track.id === 'fresh-1');
      const recentRank = ranked.find((r) => r.track.id === 'recent-1');
      const skippedRank = ranked.find((r) => r.track.id === 'skip-1');

      expect(freshRank).toBeDefined();
      expect(recentRank).toBeDefined();
      expect(skippedRank).toBeDefined();

      expect(freshRank!.finalScore).toBeGreaterThan(recentRank!.finalScore);
      expect(freshRank!.finalScore).toBeGreaterThan(skippedRank!.finalScore);
    });

    it('boosts liked tracks and artists with high affinity', () => {
      const candidates: CandidateTrack[] = [
        { id: 'c1', title: 'Blinding Lights', artist: 'The Weeknd', source: 'catalog' },
        { id: 'c2', title: 'Random Song', artist: 'Unknown Person', source: 'catalog' },
      ];

      const ranked = ranker.rank({
        candidates,
        intent: {},
        profile: baseProfile,
      });

      expect(ranked[0].track.id).toBe('c1');
      expect(ranked[0].reasons).toContain('Previously liked track');
      expect(ranked[0].reasons.some((r) => r.includes('High artist affinity'))).toBe(true);
    });

    it('gives highest priority to explicit user artist request', () => {
      const candidates: CandidateTrack[] = [
        { id: 'a1', title: 'Kesariya', artist: 'Arijit Singh', source: 'catalog' },
        { id: 'a2', title: 'After Hours', artist: 'The Weeknd', source: 'catalog' },
      ];

      // Even though user has negative affinity for Arijit Singh in baseProfile,
      // an explicit request for Arijit Singh must override generic preference!
      const ranked = ranker.rank({
        candidates,
        intent: { artist: 'Arijit Singh' },
        profile: baseProfile,
      });

      expect(ranked[0].track.artist).toBe('Arijit Singh');
      expect(ranked[0].reasons.some((r) => r.includes('Direct artist match'))).toBe(true);
    });

    it('exploration mode boosts unfamiliar discovery tracks', () => {
      const candidates: CandidateTrack[] = [
        { id: 'e1', title: 'Indie Hidden Gem', artist: 'Fresh Newcomer', source: 'catalog' },
        { id: 'e2', title: 'Familiar Song', artist: 'Regular Artist', source: 'catalog' },
      ];

      const rankedHigh = ranker.rank({
        candidates,
        intent: { explorationLevel: 'HIGH' },
        profile: baseProfile,
      });

      const indieCandidate = rankedHigh.find((r) => r.track.id === 'e1');
      expect(indieCandidate?.reasons).toContain('Exploration discovery candidate');
      expect(indieCandidate?.componentScores.exploration).toBe(1.0);
    });
  });

  // ── 2. Diversity Controller ────────────────────────────────────────────────
  describe('Diversity Controller', () => {
    const diversity = new DiversityController();

    it('enforces maximum same-artist streak', () => {
      const ranked = [
        { track: { id: '1', title: 'Song 1', artist: 'Drake', source: 'catalog' as const }, finalScore: 0.9, componentScores: {} as any, reasons: [] },
        { track: { id: '2', title: 'Song 2', artist: 'Drake', source: 'catalog' as const }, finalScore: 0.88, componentScores: {} as any, reasons: [] },
        { track: { id: '3', title: 'Song 3', artist: 'Drake', source: 'catalog' as const }, finalScore: 0.85, componentScores: {} as any, reasons: [] },
        { track: { id: '4', title: 'Song 4', artist: 'Post Malone', source: 'catalog' as const }, finalScore: 0.8, componentScores: {} as any, reasons: [] },
      ];

      // Recent history already ends with Drake
      const recentTracks: QueuedTrack[] = [
        { id: 'r1', title: 'Recent Drake', artist: 'Drake' },
      ];

      const selected = diversity.applyDiversity({
        ranked,
        recentTracks,
        options: { maxSameArtistStreak: 2, minTrackDistance: 15 },
        count: 2,
      });

      // Since recentTracks already had 1 Drake song, only 1 more Drake song should be allowed before Post Malone!
      expect(selected[0].track.artist).toBe('Drake');
      expect(selected[1].track.artist).toBe('Post Malone');
    });

    it('relaxes artist streak constraint when user explicitly asked for that artist', () => {
      const ranked = [
        { track: { id: '1', title: 'Song 1', artist: 'The Weeknd', source: 'catalog' as const }, finalScore: 0.9, componentScores: {} as any, reasons: [] },
        { track: { id: '2', title: 'Song 2', artist: 'The Weeknd', source: 'catalog' as const }, finalScore: 0.88, componentScores: {} as any, reasons: [] },
        { track: { id: '3', title: 'Song 3', artist: 'The Weeknd', source: 'catalog' as const }, finalScore: 0.85, componentScores: {} as any, reasons: [] },
      ];

      const selected = diversity.applyDiversity({
        ranked,
        recentTracks: [],
        explicitArtist: 'The Weeknd',
        count: 3,
      });

      expect(selected).toHaveLength(3);
      expect(selected.every((s) => s.track.artist === 'The Weeknd')).toBe(true);
    });
  });

  // ── 3. Implicit Learning & Preference Evolution ────────────────────────────
  describe('Preference Learner', () => {
    const learner = new PreferenceLearner();

    it('strengthens artist and genre affinity upon track completion', async () => {
      const testUserId = `test-user-${Date.now()}`;
      await learner.processEvent(testUserId, {
        sessionId: 'sess-1',
        trackId: 't-1',
        title: 'Starboy',
        artist: 'The Weeknd',
        genre: 'pop',
        language: 'english',
        eventType: 'PLAY_COMPLETED',
        timestamp: Date.now(),
        percentagePlayed: 100,
      });

      const { musicProfileService } = await import('../modules/music/music-profile-service');
      const profile = await musicProfileService.getProfile(testUserId);

      expect(profile.artistAffinity['the weeknd']).toBeGreaterThan(0);
      expect(profile.genreAffinity['pop']).toBeGreaterThan(0);
      expect(profile.languageAffinity['english']).toBeGreaterThan(0);
      expect(profile.completionHistory).toHaveLength(1);
    });

    it('penalizes artist upon early skip', async () => {
      const testUserId = `test-user-skip-${Date.now()}`;
      await learner.processEvent(testUserId, {
        sessionId: 'sess-2',
        trackId: 't-skip',
        title: 'Annoying Song',
        artist: 'Loud Artist',
        eventType: 'SKIPPED',
        timestamp: Date.now(),
        percentagePlayed: 5,
        durationPlayed: 5,
      });

      const { musicProfileService } = await import('../modules/music/music-profile-service');
      const profile = await musicProfileService.getProfile(testUserId);

      expect(profile.artistAffinity['loud artist']).toBeLessThan(0);
      expect(profile.skipHistory).toHaveLength(1);
    });

    it('adds to likedTracks and boosts affinity upon replay', async () => {
      const testUserId = `test-user-replay-${Date.now()}`;
      await learner.processEvent(testUserId, {
        sessionId: 'sess-3',
        trackId: 't-replay',
        title: 'Believer',
        artist: 'Imagine Dragons',
        eventType: 'REPLAYED',
        timestamp: Date.now(),
      });

      const { musicProfileService } = await import('../modules/music/music-profile-service');
      const profile = await musicProfileService.getProfile(testUserId);

      expect(profile.artistAffinity['imagine dragons']).toBeGreaterThan(0.2);
      expect(profile.likedTracks).toContain('believer');
    });
  });

  // ── 4. Queue Management & Session Lifecycle ────────────────────────────────
  describe('Queue Manager & Session Lifecycle', () => {
    const queueMgr = new QueueManager();

    it('advances queue and promotes next track to current', () => {
      const session: MusicSession = {
        sessionId: 'test-session-advance',
        userId: 'u1',
        mode: 'AUTOPLAY',
        status: 'PLAYING',
        currentTrack: { id: 'track-1', title: 'Song 1', artist: 'Artist 1' },
        queue: [
          { id: 'track-2', title: 'Song 2', artist: 'Artist 2' },
          { id: 'track-3', title: 'Song 3', artist: 'Artist 3' },
        ],
        playbackHistory: [],
        musicIntent: {},
        autoplayEnabled: true,
        sessionStartedAt: Date.now(),
        updatedAt: Date.now(),
      };

      const advanced = queueMgr.advance(session);
      expect(advanced).toBeDefined();
      expect(advanced?.id).toBe('track-2');
      expect(session.currentTrack?.id).toBe('track-2');
      expect(session.playbackHistory).toHaveLength(1);
      expect(session.playbackHistory[0].id).toBe('track-1');
      expect(session.queue).toHaveLength(1);
    });

    it('flushes upcoming queue upon intent update without interrupting currentTrack', () => {
      const session: MusicSession = {
        sessionId: 'test-session-flush',
        userId: 'u1',
        mode: 'AUTOPLAY',
        status: 'PLAYING',
        currentTrack: { id: 'track-active', title: 'Active Song', artist: 'Active Artist' },
        queue: [
          { id: 'queued-1', title: 'Queued 1', artist: 'Queued Artist 1' },
        ],
        playbackHistory: [],
        musicIntent: { mood: 'energetic' },
        autoplayEnabled: true,
        sessionStartedAt: Date.now(),
        updatedAt: Date.now(),
      };

      queueMgr.flushUpcoming(session);
      expect(session.queue).toHaveLength(0);
      expect(session.currentTrack?.id).toBe('track-active');
    });

    it('creates a MusicSession with pre-resolved seed track and populated queue', async () => {
      const sessionMgr = new MusicSessionManager();
      const session = await sessionMgr.createSession({
        userId: 'test-session-user',
        seedTrack: {
          id: 'seed-1',
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          audioUrl: 'https://aac.saavncdn.com/test_320.mp4',
        },
        mode: 'AUTOPLAY',
        intent: { artist: 'The Weeknd' },
      });

      expect(session.sessionId).toBeDefined();
      expect(session.currentTrack?.title).toBe('Blinding Lights');
      expect(session.autoplayEnabled).toBe(true);
      expect(session.status).toBe('PLAYING');
    });
  });

  // ── 5. Context Provider Graceful Degradation ───────────────────────────────
  describe('Context Provider Graceful Degradation', () => {
    const contextProvider = new MusicContextProvider();

    it('gracefully degrades when no location, conversation, or memory exists', async () => {
      const snapshot = await contextProvider.getContextSnapshot(
        'non-existent-user-id',
        undefined,
        'America/New_York'
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.currentTime).toBeDefined();
      expect(snapshot.timeOfDay).toBeDefined();
      expect(snapshot.location).toBeUndefined();
      expect(snapshot.relevantMemories).toBeUndefined();
      expect(snapshot.conversationContext).toBeUndefined();
    });
  });
});
