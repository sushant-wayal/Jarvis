import { QueuedTrack, RankedCandidate, normalizeSongTitle } from './music-types';

export interface DiversityOptions {
  maxSameArtistStreak: number;
  minTrackDistance: number;
}

export const DEFAULT_DIVERSITY: DiversityOptions = {
  maxSameArtistStreak: 2,
  minTrackDistance: 15,
};

export class DiversityController {
  /**
   * Filters and orders candidates to enforce diversity constraints while respecting explicit intent.
   */
  applyDiversity(params: {
    ranked: RankedCandidate[];
    recentTracks: QueuedTrack[];
    explicitArtist?: string;
    options?: Partial<DiversityOptions>;
    count?: number;
  }): RankedCandidate[] {
    const {
      ranked,
      recentTracks,
      explicitArtist,
      options,
      count = 5,
    } = params;

    const maxStreak = explicitArtist
      ? 10 // Relax streak limit if user explicitly asked for this artist
      : (options?.maxSameArtistStreak ?? DEFAULT_DIVERSITY.maxSameArtistStreak);

    const minDistance = options?.minTrackDistance ?? DEFAULT_DIVERSITY.minTrackDistance;

    const selected: RankedCandidate[] = [];
    const recentIds = new Set(recentTracks.slice(-minDistance).map((t) => t.id));
    const recentTitles = new Set(recentTracks.slice(-minDistance).map((t) => normalizeSongTitle(t.title)));

    // Track active artist streak starting from the end of recentTracks
    let currentStreakArtist = '';
    let currentStreakCount = 0;

    for (let i = recentTracks.length - 1; i >= 0; i--) {
      const a = recentTracks[i].artist.toLowerCase();
      if (!currentStreakArtist) {
        currentStreakArtist = a;
        currentStreakCount = 1;
      } else if (currentStreakArtist === a) {
        currentStreakCount++;
      } else {
        break;
      }
    }

    for (const candidate of ranked) {
      if (selected.length >= count) break;

      const track = candidate.track;
      const titleKey = normalizeSongTitle(track.title);
      const artistKey = track.artist.toLowerCase();

      // Avoid duplicate song or repetition within recent window
      if (!titleKey || recentIds.has(track.id) || recentTitles.has(titleKey)) {
        continue;
      }

      // Check artist streak
      if (artistKey === currentStreakArtist && currentStreakCount >= maxStreak) {
        continue;
      }

      // Candidate approved
      selected.push(candidate);
      recentIds.add(track.id);
      recentTitles.add(titleKey);

      if (artistKey === currentStreakArtist) {
        currentStreakCount++;
      } else {
        currentStreakArtist = artistKey;
        currentStreakCount = 1;
      }
    }

    // Fallback: If constraints were too strict and left us with fewer tracks than requested,
    // fill remainder from top ranked candidates that aren't exact or title duplicates
    if (selected.length < count) {
      const selectedIds = new Set(selected.map((c) => c.track.id));
      const selectedTitles = new Set(selected.map((c) => normalizeSongTitle(c.track.title)));
      for (const candidate of ranked) {
        if (selected.length >= count) break;
        const norm = normalizeSongTitle(candidate.track.title);
        if (!selectedIds.has(candidate.track.id) && !selectedTitles.has(norm) && !recentTitles.has(norm)) {
          selected.push(candidate);
          selectedIds.add(candidate.track.id);
          selectedTitles.add(norm);
        }
      }
    }

    return selected;
  }
}

export const diversityController = new DiversityController();
