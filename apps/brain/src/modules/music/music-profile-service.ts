import { MusicProfile } from './music-types';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';

const DEFAULT_PROFILE: MusicProfile = {
  likedTracks: [],
  dislikedTracks: [],
  dislikedArtists: [],
  artistAffinity: {},
  genreAffinity: {},
  languageAffinity: {},
  skipHistory: [],
  completionHistory: [],
  recentlyPlayedTracks: [],
  explorationPreference: 'MEDIUM',
  preferredEnergy: 'medium',
  preferredMoods: [],
};

export class MusicProfileService {
  private cache = new Map<string, MusicProfile>();

  /**
   * Retrieves the user's music profile, either from memory cache or Prisma DB.
   */
  async getProfile(userId: string): Promise<MusicProfile> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      if (user?.preferences) {
        const parsed = JSON.parse(user.preferences);
        if (parsed.musicProfile) {
          const profile: MusicProfile = {
            ...DEFAULT_PROFILE,
            ...parsed.musicProfile,
          };
          this.cache.set(userId, profile);
          return profile;
        }
      }
    } catch (err) {
      logger.warn('Failed to load music profile from DB, using defaults', { userId, err });
    }

    const initial = { ...DEFAULT_PROFILE };
    this.cache.set(userId, initial);
    return initial;
  }

  /**
   * Saves updated music profile into User.preferences in Prisma.
   */
  async saveProfile(userId: string, profile: MusicProfile): Promise<void> {
    this.cache.set(userId, profile);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });

      if (!user) {
        // User not in DB yet (e.g. test runner or transient session), keep in-memory cache
        return;
      }

      let existingPrefs: Record<string, unknown> = {};
      if (user.preferences) {
        try {
          existingPrefs = JSON.parse(user.preferences);
        } catch {
          existingPrefs = {};
        }
      }

      existingPrefs.musicProfile = profile;

      await prisma.user.update({
        where: { id: userId },
        data: { preferences: JSON.stringify(existingPrefs) },
      });
    } catch (err) {
      logger.error('Failed to persist music profile to database', { userId, err });
    }
  }

  /**
   * Records a track into the user's recently played list (keeps last 50).
   */
  async recordPlayedTrack(
    userId: string,
    track: { id: string; title: string; artist: string }
  ): Promise<void> {
    const profile = await this.getProfile(userId);
    const updatedRecents = [
      {
        id: track.id,
        title: track.title,
        artist: track.artist,
        timestamp: Date.now(),
      },
      ...profile.recentlyPlayedTracks.filter((t) => t.id !== track.id),
    ].slice(0, 50);

    profile.recentlyPlayedTracks = updatedRecents;
    await this.saveProfile(userId, profile);
  }

  /**
   * Dislikes an artist and/or track directly.
   */
  async dislike(
    userId: string,
    params: { trackTitle?: string; artist?: string }
  ): Promise<void> {
    const profile = await this.getProfile(userId);

    if (params.trackTitle) {
      const clean = params.trackTitle.trim().toLowerCase();
      if (!profile.dislikedTracks.includes(clean)) {
        profile.dislikedTracks.push(clean);
      }
    }

    if (params.artist) {
      const cleanArtist = params.artist.trim().toLowerCase();
      if (!profile.dislikedArtists.includes(cleanArtist)) {
        profile.dislikedArtists.push(cleanArtist);
      }
      profile.artistAffinity[cleanArtist] = -1.0;
    }

    await this.saveProfile(userId, profile);
  }

  /**
   * Likes an artist and/or track directly.
   */
  async like(
    userId: string,
    params: { trackTitle?: string; artist?: string }
  ): Promise<void> {
    const profile = await this.getProfile(userId);

    if (params.trackTitle) {
      const clean = params.trackTitle.trim().toLowerCase();
      if (!profile.likedTracks.includes(clean)) {
        profile.likedTracks.push(clean);
      }
      profile.dislikedTracks = profile.dislikedTracks.filter((t) => t !== clean);
    }

    if (params.artist) {
      const cleanArtist = params.artist.trim().toLowerCase();
      profile.dislikedArtists = profile.dislikedArtists.filter((a) => a !== cleanArtist);
      const current = profile.artistAffinity[cleanArtist] || 0;
      profile.artistAffinity[cleanArtist] = Math.min(1.0, current + 0.3);
    }

    await this.saveProfile(userId, profile);
  }
}

export const musicProfileService = new MusicProfileService();
