import { PlaybackEvent } from './music-types';
import { musicProfileService } from './music-profile-service';
import { logger } from '@/lib/logging/logger';

export class PreferenceLearner {
  /**
   * Processes a playback event and incrementally updates the user's music profile.
   */
  async processEvent(userId: string, event: PlaybackEvent): Promise<void> {
    const profile = await musicProfileService.getProfile(userId);
    const artistKey = event.artist.toLowerCase().trim();
    const genreKey = event.genre?.toLowerCase().trim();
    const langKey = event.language?.toLowerCase().trim();

    const currentArtistAffinity = profile.artistAffinity[artistKey] ?? 0;
    const currentGenreAffinity = genreKey ? profile.genreAffinity[genreKey] ?? 0 : 0;
    const currentLangAffinity = langKey ? profile.languageAffinity[langKey] ?? 0 : 0;

    switch (event.eventType) {
      case 'PLAY_STARTED': {
        await musicProfileService.recordPlayedTrack(userId, {
          id: event.trackId,
          title: event.title,
          artist: event.artist,
        });
        break;
      }

      case 'PLAY_COMPLETED': {
        // Positive signal
        profile.artistAffinity[artistKey] = Math.min(1.0, currentArtistAffinity + 0.15);
        if (genreKey) {
          profile.genreAffinity[genreKey] = Math.min(1.0, currentGenreAffinity + 0.1);
        }
        if (langKey) {
          profile.languageAffinity[langKey] = Math.min(1.0, currentLangAffinity + 0.08);
        }

        profile.completionHistory = [
          { trackId: event.trackId, artist: event.artist, timestamp: event.timestamp || Date.now() },
          ...profile.completionHistory.slice(0, 49),
        ];
        break;
      }

      case 'REPLAYED': {
        // Strong positive signal
        profile.artistAffinity[artistKey] = Math.min(1.0, currentArtistAffinity + 0.3);
        const titleKey = event.title.toLowerCase().trim();
        if (!profile.likedTracks.includes(titleKey)) {
          profile.likedTracks.push(titleKey);
        }
        break;
      }

      case 'SKIPPED': {
        const pct = event.percentagePlayed ?? 0;
        const duration = event.durationPlayed ?? 0;

        let delta = -0.1;
        if (pct < 15 || duration < 15) {
          // Early skip = strong negative signal
          delta = -0.25;
        } else if (pct > 80) {
          // Late skip = very weak negative / neutral
          delta = -0.03;
        }

        profile.artistAffinity[artistKey] = Math.max(-1.0, currentArtistAffinity + delta);

        profile.skipHistory = [
          {
            trackId: event.trackId,
            artist: event.artist,
            timestamp: event.timestamp || Date.now(),
            percentage: pct,
          },
          ...profile.skipHistory.slice(0, 49),
        ];
        break;
      }

      case 'FAILED': {
        logger.warn('Audio stream playback failed', {
          sessionId: event.sessionId,
          trackId: event.trackId,
          title: event.title,
        });
        break;
      }

      default:
        break;
    }

    await musicProfileService.saveProfile(userId, profile);
    logger.info('Updated music profile from playback event', {
      userId,
      eventType: event.eventType,
      artist: event.artist,
      newAffinity: profile.artistAffinity[artistKey],
    });
  }
}

export const preferenceLearner = new PreferenceLearner();
