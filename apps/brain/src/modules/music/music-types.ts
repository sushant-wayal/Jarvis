import { z } from 'zod';
import {
  ExplorationLevel,
  MusicContextSnapshot,
  MusicIntent,
  MusicMode,
  MusicProfile,
  MusicSession,
  MusicSessionStatus,
  PlaybackEvent,
  PlaybackEventType,
  QueuedTrack,
  SimilarityMode,
} from '@jarvis/shared';

export const MusicIntentSchema = z.object({
  mood: z.string().optional(),
  energy: z.enum(['low', 'medium', 'high']).optional(),
  genre: z.string().optional(),
  language: z.string().optional(),
  artist: z.string().optional(),
  era: z.string().optional(),
  activity: z.string().optional(),
  similarityMode: z
    .enum(['SEED_TRACK', 'CURRENT_TRACK', 'ARTIST', 'GENRE', 'DISCOVERY'])
    .optional(),
  explorationLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  userExplicitPreferences: z.string().optional(),
  query: z.string().optional(),
});

export const PlaybackEventInputSchema = z.object({
  sessionId: z.string(),
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  genre: z.string().optional(),
  language: z.string().optional(),
  eventType: z.enum([
    'PLAY_STARTED',
    'PLAYED_25_PERCENT',
    'PLAYED_50_PERCENT',
    'PLAYED_75_PERCENT',
    'PLAY_COMPLETED',
    'SKIPPED',
    'REPLAYED',
    'FAILED',
  ]),
  timestamp: z.number().optional(),
  durationPlayed: z.number().optional(),
  percentagePlayed: z.number().optional(),
});

export const CreateMusicSessionInputSchema = z.object({
  userId: z.string().optional(),
  query: z.string().optional(),
  mode: z.enum(['SINGLE', 'AUTOPLAY', 'RADIO', 'PLAYLIST']).optional(),
  intent: MusicIntentSchema.optional(),
  seedTrack: z
    .object({
      id: z.string(),
      title: z.string(),
      artist: z.string(),
      album: z.string().optional(),
      audioUrl: z.string().optional(),
      artworkUrl: z.string().optional(),
      duration: z.number().optional(),
      source: z.enum(['catalog', 'youtube', 'spotify']).optional(),
      videoId: z.string().optional(),
    })
    .optional(),
});

export const ReplenishQueueInputSchema = z.object({
  sessionId: z.string(),
  count: z.number().min(1).max(10).optional().default(5),
});

export interface CandidateTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  language?: string;
  duration?: number;
  source: 'catalog' | 'youtube';
  audioUrl?: string;
  artworkUrl?: string;
  videoId?: string;
  similarityScore?: number;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export interface RankedCandidate {
  track: CandidateTrack;
  finalScore: number;
  componentScores: {
    seedSimilarity: number;
    userPreference: number;
    contextRelevance: number;
    artistAffinity: number;
    genreAffinity: number;
    languageAffinity: number;
    freshness: number;
    exploration: number;
    penalty: number;
  };
  reasons: string[];
}

export type {
  ExplorationLevel,
  MusicContextSnapshot,
  MusicIntent,
  MusicMode,
  MusicProfile,
  MusicSession,
  MusicSessionStatus,
  PlaybackEvent,
  PlaybackEventType,
  QueuedTrack,
  SimilarityMode,
};

/**
 * Normalizes a song title to a canonical representation for deduplication.
 * Removes parenthetical metadata like "(From ...)", "[OST ...]", "(Remix)", "(Lofi)",
 * feature tags, punctuation, and extraneous spacing.
 */
export function normalizeSongTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    // Remove (From ...), [From ...], (feat. ...), [feat. ...], etc.
    .replace(/\((feat\.|with|ft\.|from|version|bonus|original|remix|lofi|unplugged|audio|official|video)[^)]*\)/gi, '')
    .replace(/\[(feat\.|with|ft\.|from|version|bonus|original|remix|lofi|unplugged|audio|official|video)[^\]]*\]/gi, '')
    // Remove "from <movie>" or "ost" or "soundtrack"
    .replace(/\b(from|ost|soundtrack|single|ep)\b/gi, '')
    // Strip remaining parentheses/brackets if any
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    // Remove special characters, keep only alphanumerics
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

