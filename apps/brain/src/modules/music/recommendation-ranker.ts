import { CandidateTrack, MusicContextSnapshot, MusicIntent, MusicProfile, QueuedTrack, RankedCandidate } from './music-types';
import { ExpandedMusicSoundscape } from './music-intent-expander';

export interface RankerWeights {
  seedSimilarity: number;
  userPreference: number;
  contextRelevance: number;
  artistAffinity: number;
  genreAffinity: number;
  languageAffinity: number;
  freshness: number;
  exploration: number;
}

export const DEFAULT_WEIGHTS: RankerWeights = {
  seedSimilarity: 0.35,
  userPreference: 0.25,
  contextRelevance: 0.15,
  artistAffinity: 0.1,
  genreAffinity: 0.05,
  languageAffinity: 0.05,
  freshness: 0.05,
  exploration: 0.1,
};

export class RecommendationRanker {
  private weights: RankerWeights;

  constructor(weights: RankerWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Ranks candidates based on weighted multi-signal scoring.
   */
  rank(params: {
    candidates: CandidateTrack[];
    intent: MusicIntent;
    soundscape?: ExpandedMusicSoundscape;
    currentTrack?: QueuedTrack | null;
    seedTrack?: QueuedTrack | null;
    profile: MusicProfile;
    context?: MusicContextSnapshot;
  }): RankedCandidate[] {
    const { candidates, intent, currentTrack, seedTrack, profile, context } = params;
    const ranked: RankedCandidate[] = [];

    const soundscape = params.soundscape || {
      isAmbientOrActivity: Boolean(intent.activity || intent.mood),
      primaryQuery: intent.query || '',
      candidateQueries: [],
      targetEnergy: intent.energy || 'medium',
      preferredGenres: intent.genre ? [intent.genre.toLowerCase()] : [],
      penalizedGenres: [],
      explanation: 'Intent ranker evaluation',
    };

    const recentlyPlayedIds = new Set(
      profile.recentlyPlayedTracks.slice(0, 20).map((t) => t.id)
    );
    const recentlySkippedIds = new Set(
      profile.skipHistory.slice(0, 10).map((s) => s.trackId)
    );

    const dislikedTracks = new Set(profile.dislikedTracks.map((t) => t.toLowerCase()));
    const dislikedArtists = new Set(profile.dislikedArtists.map((a) => a.toLowerCase()));

    for (const track of candidates) {
      const trackTitleKey = track.title.toLowerCase();
      const trackArtistKey = track.artist.toLowerCase();

      // Hard filter: Disliked track or artist
      if (dislikedTracks.has(trackTitleKey) || dislikedArtists.has(trackArtistKey)) {
        continue;
      }

      const reasons: string[] = [];

      // 1. Seed / Current Track Similarity
      let seedSimilarity = track.similarityScore ?? 0.5;
      const targetArtist = (intent.artist || currentTrack?.artist || seedTrack?.artist || '').toLowerCase();
      if (targetArtist && trackArtistKey.includes(targetArtist)) {
        if (intent.artist || !soundscape.isAmbientOrActivity) {
          seedSimilarity = 1.0;
          reasons.push(`Direct artist match: ${track.artist}`);
        }
      }

      // 2. User Preference (Likes & Replays)
      let userPreference = 0.5;
      if (profile.likedTracks.some((t) => t.toLowerCase() === trackTitleKey)) {
        userPreference = 1.0;
        reasons.push('Previously liked track');
      }

      // 3. Artist Affinity (-1.0 to 1.0 normalized to 0.0 to 1.0)
      const rawArtistAffinity = profile.artistAffinity[trackArtistKey] ?? 0;
      const artistAffinity = (rawArtistAffinity + 1) / 2;
      if (rawArtistAffinity > 0.2) {
        reasons.push(`High artist affinity (+${rawArtistAffinity.toFixed(2)})`);
      }

      // 4. Genre & Language Affinity
      const trackGenre = (track.genre || '').toLowerCase();
      const rawGenreAffinity = trackGenre ? profile.genreAffinity[trackGenre] ?? 0 : 0;
      const genreAffinity = (rawGenreAffinity + 1) / 2;

      const trackLang = (track.language || '').toLowerCase();
      const rawLangAffinity = trackLang ? profile.languageAffinity[trackLang] ?? 0 : 0;
      const languageAffinity = (rawLangAffinity + 1) / 2;

      // 5. Context & Soundscape Relevance (Time of day, activity, soundscape)
      let contextRelevance = 0.5;
      if (context?.timeOfDay) {
        if (context.timeOfDay === 'night' && (track.genre?.includes('lofi') || track.genre?.includes('acoustic'))) {
          contextRelevance += 0.3;
          reasons.push('Night-time acoustic / chill match');
        } else if (context.timeOfDay === 'morning') {
          contextRelevance += 0.2;
        }
      }
      if (intent.activity) {
        contextRelevance += 0.3;
        reasons.push(`Matches activity: ${intent.activity}`);
      }

      // Soundscape matching and energy verification
      let penalty = 0;

      if (soundscape.isAmbientOrActivity) {
        // Boost tracks matching preferred genres or soundscapes
        const isPreferred = soundscape.preferredGenres.some((pref) => {
          const reg = new RegExp(`\\b${pref}\\b`, 'i');
          return reg.test(trackGenre) || reg.test(trackTitleKey);
        });
        if (isPreferred) {
          contextRelevance += 0.35;
          reasons.push(`Matches soundscape: ${track.title}`);
        }

        // Penalize mismatched genres (defined semantically by LLM soundscape)
        const isPenalized = soundscape.penalizedGenres.some((pg) => {
          const reg = new RegExp(`\\b${pg}\\b`, 'i');
          return reg.test(trackGenre) || reg.test(trackTitleKey) || reg.test(trackArtistKey);
        });
        if (isPenalized) {
          penalty += 0.6;
        }
      }

      contextRelevance = Math.min(1.0, contextRelevance);

      // 6. Freshness (Penalize recently played)
      let freshness = 1.0;
      if (recentlyPlayedIds.has(track.id)) {
        freshness = 0.1;
      }

      // 7. Exploration Bonus
      let exploration = 0.2;
      const isUnfamiliar = rawArtistAffinity === 0 && !recentlyPlayedIds.has(track.id);
      if (intent.explorationLevel === 'HIGH' && isUnfamiliar) {
        exploration = 1.0;
        reasons.push('Exploration discovery candidate');
      }

      // 8. Repetition & Skip Penalties
      if (currentTrack && currentTrack.artist.toLowerCase() === trackArtistKey) {
        // Same artist repetition penalty (unless user explicitly asked for this artist)
        if (!intent.artist) {
          penalty += 0.25;
        }
      }
      if (recentlySkippedIds.has(track.id)) {
        penalty += 0.5;
      }

      // Weighted Final Score Calculation
      const baseScore =
        seedSimilarity * this.weights.seedSimilarity +
        userPreference * this.weights.userPreference +
        contextRelevance * this.weights.contextRelevance +
        artistAffinity * this.weights.artistAffinity +
        genreAffinity * this.weights.genreAffinity +
        languageAffinity * this.weights.languageAffinity +
        freshness * this.weights.freshness +
        exploration * this.weights.exploration;

      const finalScore = Math.max(0.01, baseScore - penalty);

      ranked.push({
        track,
        finalScore,
        componentScores: {
          seedSimilarity,
          userPreference,
          contextRelevance,
          artistAffinity,
          genreAffinity,
          languageAffinity,
          freshness,
          exploration,
          penalty,
        },
        reasons,
      });
    }

    // Sort descending by final score
    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
  }
}

export const recommendationRanker = new RecommendationRanker();
