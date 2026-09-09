import https from 'https';
import http from 'http';
import {
  CandidateTrack,
  MusicContextSnapshot,
  MusicIntent,
  MusicProfile,
  QueuedTrack,
  normalizeSongTitle,
} from './music-types';
import { expandMusicIntent } from './music-intent-expander';
import { decryptDesEcb } from '@/modules/media/music-resolver';
import { logger } from '@/lib/logging/logger';

function getTimeOfDayMusicalQuery(timeOfDay: string, language?: string): string {
  const langPrefix = language ? `${language} ` : '';
  switch (timeOfDay.toLowerCase()) {
    case 'morning':
      return `${langPrefix}morning acoustic chill`;
    case 'afternoon':
      return `${langPrefix}afternoon chill vibes`;
    case 'evening':
      return `${langPrefix}evening acoustic sunset`;
    case 'night':
      return `${langPrefix}late night chill lofi`;
    default:
      return `${langPrefix}trending acoustic hits`;
  }
}


function fetchJson(url: string, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

export class CandidateGenerator {
  /**
   * Generates candidate tracks from multiple complementary sources.
   */
  async generateCandidates(params: {
    intent: MusicIntent;
    currentTrack?: QueuedTrack | null;
    seedTrack?: QueuedTrack | null;
    profile: MusicProfile;
    context?: MusicContextSnapshot;
    limit?: number;
  }): Promise<CandidateTrack[]> {
    const { intent, currentTrack, seedTrack, profile, context, limit = 20 } = params;
    const candidates: CandidateTrack[] = [];
    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();

    if (currentTrack?.title) {
      seenTitles.add(normalizeSongTitle(currentTrack.title));
    }
    if (seedTrack?.title) {
      seenTitles.add(normalizeSongTitle(seedTrack.title));
    }

    const queries: Array<{ query: string; sourceWeight: number; reason: string }> = [];

    // Expand intent to get musical soundscape queries
    const soundscape = expandMusicIntent(intent);

    if (soundscape.isAmbientOrActivity && soundscape.candidateQueries.length > 0) {
      // Prioritize curated soundscape queries for activity/ambient requests
      for (const sq of soundscape.candidateQueries.slice(0, 3)) {
        queries.push({
          query: sq,
          sourceWeight: 0.95,
          reason: `Soundscape: ${sq}`,
        });
      }
    }

    // Explicit artist requested by user
    if (intent.artist) {
      queries.push({
        query: intent.artist,
        sourceWeight: 0.95,
        reason: `Explicit artist match: ${intent.artist}`,
      });
    } else if (!soundscape.isAmbientOrActivity) {
      // Seed / current track artist only if user did not make an ambient soundscape request
      const effectiveArtist = currentTrack?.artist || seedTrack?.artist;
      if (effectiveArtist) {
        queries.push({
          query: effectiveArtist,
          sourceWeight: 0.9,
          reason: `Artist match: ${effectiveArtist}`,
        });
      }
    }

    // User high-affinity artists (top 2, only if not ambient or compatible)
    if (!soundscape.isAmbientOrActivity) {
      const targetArtist = intent.artist || currentTrack?.artist || seedTrack?.artist;
      const topAffinityArtists = Object.entries(profile.artistAffinity)
        .filter(([artist, score]) => score > 0.3 && artist.toLowerCase() !== targetArtist?.toLowerCase())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([artist]) => artist);

      for (const affArtist of topAffinityArtists) {
        queries.push({
          query: affArtist,
          sourceWeight: 0.75,
          reason: `User favorite artist: ${affArtist}`,
        });
      }
    }

    // Time of Day or Exploration Fallback
    if (intent.explorationLevel === 'HIGH') {
      queries.push({
        query: intent.language ? `${intent.language} hits fresh` : 'global trending hits',
        sourceWeight: 0.7,
        reason: 'Exploration discovery',
      });
    } else if (queries.length < 3 && context?.timeOfDay) {
      const todQuery = getTimeOfDayMusicalQuery(context.timeOfDay, intent.language);
      queries.push({
        query: todQuery,
        sourceWeight: 0.65,
        reason: `Time of day: ${context.timeOfDay}`,
      });
    }

    // Execute queries in parallel (capped at 4 queries max)
    const searchPromises = queries.slice(0, 4).map(async ({ query, sourceWeight, reason }) => {
      try {
        const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&n=10&p=1&q=${encodeURIComponent(query)}`;
        const res = await fetchJson(url, 3500);
        const results = res?.results;
        if (!Array.isArray(results)) return [];

        const tracks: CandidateTrack[] = [];
        for (const item of results) {
          if (!item?.id || seenIds.has(item.id)) continue;

          const title = (item.song || item.title || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
          const normTitle = normalizeSongTitle(title);
          if (!normTitle || seenTitles.has(normTitle)) continue;

          seenIds.add(item.id);
          seenTitles.add(normTitle);

          const artist = (item.singers || item.primary_artists || item.music || 'Unknown').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
          const artworkUrl = item.image ? item.image.replace('150x150', '500x500') : undefined;

          let audioUrl: string | undefined;
          if (item.encrypted_media_url) {
            try {
              const dec = decryptDesEcb(item.encrypted_media_url);
              if (dec && dec.startsWith('http')) {
                audioUrl = dec.replace('_96.mp4', '_320.mp4').replace('_160.mp4', '_320.mp4');
              }
            } catch {
              // Ignore decryption failure
            }
          }

          tracks.push({
            id: item.id,
            title,
            artist,
            album: item.album?.replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim(),
            genre: item.language,
            language: item.language,
            duration: Number(item.duration || 0),
            source: 'catalog',
            audioUrl,
            artworkUrl,
            similarityScore: sourceWeight,
            explanation: reason,
          });
        }
        return tracks;
      } catch (err) {
        logger.warn('Failed search query in candidate generator', { query, err });
        return [];
      }
    });

    const searchResults = await Promise.all(searchPromises);
    for (const list of searchResults) {
      candidates.push(...list);
      if (candidates.length >= limit * 2) break;
    }

    return candidates.slice(0, limit);
  }
}

export const candidateGenerator = new CandidateGenerator();
