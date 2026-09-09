import { MusicIntent } from './music-types';

export interface ExpandedMusicSoundscape {
  isAmbientOrActivity: boolean;
  primaryQuery: string;
  candidateQueries: string[];
  targetEnergy: 'low' | 'medium' | 'high';
  preferredGenres: string[];
  penalizedGenres: string[];
  explanation: string;
}

const FOCUS_KEYWORDS = [
  'focus',
  'deep focus',
  'chess',
  'study',
  'studying',
  'reading',
  'read',
  'work',
  'working',
  'coding',
  'code',
  'concentration',
  'concentrate',
];

const SLEEP_KEYWORDS = [
  'sleep',
  'sleeping',
  'bedtime',
  'sleepy',
  'deep sleep',
  'meditation',
  'meditate',
];

const WORKOUT_KEYWORDS = [
  'workout',
  'gym',
  'running',
  'cardio',
  'exercise',
  'fitness',
  'training',
  'pump up',
];

const CHILL_KEYWORDS = [
  'chill',
  'relax',
  'relaxing',
  'calm',
  'peaceful',
  'unwind',
  'lofi',
  'acoustic',
];

const PARTY_KEYWORDS = [
  'party',
  'dance',
  'club',
  'celebrate',
  'celebration',
  'bhangra',
  'dj',
];

const GENERIC_KEYWORDS = [
  'music',
  'some music',
  'any music',
  'songs',
  'some songs',
  'surprise me',
  'play something',
];

/**
 * Checks if a string matches any of the given keywords as a whole phrase or word.
 */
function matchesKeyword(text: string, keywords: string[]): boolean {
  if (!text) return false;
  const norm = text.toLowerCase().trim();
  if (keywords.includes(norm)) return true;
  return keywords.some((kw) => {
    const reg = new RegExp(`\\b${kw}\\b`, 'i');
    return reg.test(norm);
  });
}

/**
 * Expands a natural language music intent (activity, mood, energy, or ambient request)
 * into rich, high-yield musical search queries and acoustic constraints.
 */
export function expandMusicIntent(intent: MusicIntent): ExpandedMusicSoundscape {
  const rawQuery = (intent.query || '').toLowerCase().trim();
  const rawActivity = (intent.activity || '').toLowerCase().trim();
  const rawMood = (intent.mood || '').toLowerCase().trim();
  const lang = (intent.language || '').toLowerCase().trim();

  // 1. Focus / Chess / Study / Coding / Concentration
  if (
    matchesKeyword(rawActivity, FOCUS_KEYWORDS) ||
    matchesKeyword(rawMood, FOCUS_KEYWORDS) ||
    matchesKeyword(rawQuery, FOCUS_KEYWORDS)
  ) {
    const primaryQuery = lang
      ? `${lang} lofi chill study`
      : 'deep focus instrumental';

    const candidateQueries = lang
      ? [
          `${lang} lofi chill study`,
          `${lang} acoustic calm`,
          'deep focus instrumental',
          'peaceful piano focus',
        ]
      : [
          'deep focus instrumental',
          'lofi chill study',
          'peaceful piano focus',
          'ambient study instrumental',
        ];

    return {
      isAmbientOrActivity: true,
      primaryQuery,
      candidateQueries,
      targetEnergy: 'low',
      preferredGenres: ['instrumental', 'lofi', 'ambient', 'classical', 'acoustic', 'piano'],
      penalizedGenres: ['rap', 'hip hop', 'hip-hop', 'party', 'edm', 'dance', 'rock', 'metal', 'club', 'bhangra'],
      explanation: 'Focus and concentration soundscape for chess, studying, or deep work',
    };
  }

  // 2. Sleep / Meditation / Deep Relaxation
  if (
    matchesKeyword(rawActivity, SLEEP_KEYWORDS) ||
    matchesKeyword(rawMood, SLEEP_KEYWORDS) ||
    matchesKeyword(rawQuery, SLEEP_KEYWORDS)
  ) {
    return {
      isAmbientOrActivity: true,
      primaryQuery: 'peaceful ambient sleep',
      candidateQueries: [
        'peaceful ambient sleep',
        'calm piano relaxation',
        'deep sleep meditation',
        'gentle ambient rain',
      ],
      targetEnergy: 'low',
      preferredGenres: ['ambient', 'instrumental', 'meditation', 'piano', 'soundscape'],
      penalizedGenres: ['rap', 'hip hop', 'edm', 'rock', 'dance', 'party', 'pop', 'upbeat'],
      explanation: 'Gentle ambient soundscape for sleep and meditation',
    };
  }

  // 3. Workout / Gym / Running / High Energy
  if (
    matchesKeyword(rawActivity, WORKOUT_KEYWORDS) ||
    matchesKeyword(rawMood, WORKOUT_KEYWORDS) ||
    matchesKeyword(rawQuery, WORKOUT_KEYWORDS) ||
    intent.energy === 'high'
  ) {
    const primaryQuery = lang
      ? `${lang} workout gym motivation`
      : 'workout motivation hits';

    const candidateQueries = lang
      ? [
          `${lang} workout gym motivation`,
          `${lang} high energy hits`,
          'workout motivation hits',
          'gym phonk edm',
        ]
      : [
          'workout motivation hits',
          'high energy gym hits',
          'gym phonk edm',
          'cardio running hits',
        ];

    return {
      isAmbientOrActivity: true,
      primaryQuery,
      candidateQueries,
      targetEnergy: 'high',
      preferredGenres: ['edm', 'dance', 'hip hop', 'hip-hop', 'rock', 'phonk', 'pop'],
      penalizedGenres: ['ambient', 'sleep', 'lullaby', 'slow piano', 'meditation'],
      explanation: 'High energy motivation for workout and fitness',
    };
  }

  // 4. Chill / Relax / Lofi / Acoustic
  if (
    matchesKeyword(rawMood, CHILL_KEYWORDS) ||
    matchesKeyword(rawActivity, CHILL_KEYWORDS) ||
    matchesKeyword(rawQuery, CHILL_KEYWORDS) ||
    intent.genre === 'lofi' ||
    intent.genre === 'acoustic'
  ) {
    const primaryQuery = lang
      ? `${lang} chill acoustic`
      : 'chill acoustic vibes';

    const candidateQueries = lang
      ? [
          `${lang} chill acoustic`,
          `${lang} lofi chill`,
          'chill acoustic vibes',
          'lofi chill beats',
        ]
      : [
          'chill acoustic vibes',
          'lofi chill beats',
          'peaceful acoustic songs',
          'calm indie chill',
        ];

    return {
      isAmbientOrActivity: true,
      primaryQuery,
      candidateQueries,
      targetEnergy: 'low',
      preferredGenres: ['lofi', 'acoustic', 'indie', 'chill', 'ambient'],
      penalizedGenres: ['heavy metal', 'hard rock', 'noisy club'],
      explanation: 'Laid-back acoustic and lofi chill soundscape',
    };
  }

  // 5. Party / Upbeat / Dance
  if (
    matchesKeyword(rawActivity, PARTY_KEYWORDS) ||
    matchesKeyword(rawMood, PARTY_KEYWORDS) ||
    matchesKeyword(rawQuery, PARTY_KEYWORDS)
  ) {
    const primaryQuery = lang ? `${lang} party dance hits` : 'party dance hits';
    return {
      isAmbientOrActivity: true,
      primaryQuery,
      candidateQueries: [
        primaryQuery,
        'club dance hits',
        'upbeat party music',
        'top dance pop',
      ],
      targetEnergy: 'high',
      preferredGenres: ['dance', 'edm', 'pop', 'party'],
      penalizedGenres: ['sleep', 'ambient', 'sad', 'slow'],
      explanation: 'Upbeat party and dance hits',
    };
  }

  // 6. Generic queries ("some music", "songs", "play music")
  if (matchesKeyword(rawQuery, GENERIC_KEYWORDS) || rawQuery.length === 0) {
    const primaryQuery = lang ? `${lang} top hits fresh` : 'global trending hits';
    return {
      isAmbientOrActivity: true,
      primaryQuery,
      candidateQueries: [
        primaryQuery,
        'popular hits fresh',
        'trending songs',
      ],
      targetEnergy: intent.energy || 'medium',
      preferredGenres: [],
      penalizedGenres: [],
      explanation: 'Curated trending music discovery',
    };
  }

  // 7. Explicit track / artist query (e.g. "Blinding Lights", "Arijit Singh")
  return {
    isAmbientOrActivity: false,
    primaryQuery: intent.query || '',
    candidateQueries: [],
    targetEnergy: intent.energy || 'medium',
    preferredGenres: intent.genre ? [intent.genre.toLowerCase()] : [],
    penalizedGenres: [],
    explanation: 'Direct user track or artist query',
  };
}
