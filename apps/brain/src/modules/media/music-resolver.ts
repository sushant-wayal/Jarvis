/**
 * Music Resolver Service
 * Tier 1: High-speed, studio-grade 320kbps CDN stream resolution (JioSaavn open catalog)
 * Tier 2: Universal YouTube audio stream fallback
 */

import https from 'https';
import http from 'http';
import { logger } from '@/lib/logging/logger';
import { resolveYouTubeVideoId } from '../tools/phone-tools';

export interface ResolvedTrack {
  success: boolean;
  title: string;
  artist: string;
  artworkUrl?: string;
  audioUrl?: string;
  duration?: number;
  source: 'catalog' | 'youtube';
  videoId?: string;
}

// ── Pure JavaScript DES Decipher (Key: '38346591') ────────────────────────────

const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
  8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
  24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

const S_BOXES = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];

const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

function permute(src: number[], table: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < table.length; i++) {
    out.push(src[table[i] - 1]);
  }
  return out;
}

function bytesToBits(bytes: Buffer): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let j = 7; j >= 0; j--) {
      bits.push((bytes[i] >> j) & 1);
    }
  }
  return bits;
}

function bitsToBytes(bits: number[]): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bits[i + j] || 0);
    }
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

function generateSubkeys(keyBytes: Buffer): number[][] {
  const keyBits = bytesToBits(keyBytes);
  const pc1Bits = permute(keyBits, PC1);
  let c = pc1Bits.slice(0, 28);
  let d = pc1Bits.slice(28, 56);
  const subkeys: number[][] = [];

  for (let round = 0; round < 16; round++) {
    const shift = SHIFTS[round];
    c = c.slice(shift).concat(c.slice(0, shift));
    d = d.slice(shift).concat(d.slice(0, shift));
    const cd = c.concat(d);
    subkeys.push(permute(cd, PC2));
  }
  return subkeys;
}

function desBlockDecrypt(blockBits: number[], subkeys: number[][]): number[] {
  const ipBits = permute(blockBits, IP);
  let left = ipBits.slice(0, 32);
  let right = ipBits.slice(32, 64);

  for (let round = 15; round >= 0; round--) {
    const expanded = permute(right, E);
    const xored = expanded.map((b, i) => b ^ subkeys[round][i]);
    const sboxOut: number[] = [];

    for (let s = 0; s < 8; s++) {
      const chunk = xored.slice(s * 6, s * 6 + 6);
      const row = (chunk[0] << 1) | chunk[5];
      const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
      const val = S_BOXES[s][row * 16 + col];
      for (let b = 3; b >= 0; b--) {
        sboxOut.push((val >> b) & 1);
      }
    }

    const pOut = permute(sboxOut, P);
    const nextLeft = right;
    right = left.map((b, i) => b ^ pOut[i]);
    left = nextLeft;
  }

  const combined = right.concat(left);
  return permute(combined, FP);
}

export function decryptDesEcb(base64Data: string, keyStr = '38346591'): string {
  const keyBytes = Buffer.from(keyStr, 'utf8');
  const subkeys = generateSubkeys(keyBytes);
  const cipherBytes = Buffer.from(base64Data, 'base64');
  const decryptedBytes: number[] = [];

  for (let i = 0; i < cipherBytes.length; i += 8) {
    const block = cipherBytes.slice(i, i + 8);
    if (block.length < 8) break;
    const blockBits = bytesToBits(block);
    const decryptedBits = desBlockDecrypt(blockBits, subkeys);
    const decBlock = bitsToBytes(decryptedBits);
    for (const b of decBlock) decryptedBytes.push(b);
  }

  // Remove PKCS#7 padding
  let buf = Buffer.from(decryptedBytes);
  const pad = buf[buf.length - 1];
  if (pad > 0 && pad <= 8) {
    buf = buf.slice(0, buf.length - pad);
  }
  return buf.toString('utf8');
}

// ── In-Memory Fast Cache ──────────────────────────────────────────────────────

const trackCache = new Map<string, ResolvedTrack>();

function getCachedTrack(query: string): ResolvedTrack | undefined {
  const norm = query.toLowerCase().trim();
  return trackCache.get(norm);
}

function setCachedTrack(query: string, track: ResolvedTrack): void {
  const norm = query.toLowerCase().trim();
  trackCache.set(norm, track);
}

// ── Tier 1: JioSaavn Direct Studio Audio Resolution ───────────────────────────

function fetchJson(url: string, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

async function resolveFromJioSaavn(query: string, artistHint?: string): Promise<ResolvedTrack | null> {
  try {
    const queryLower = query.toLowerCase().trim();
    const wantsMix =
      queryLower.includes('mix') ||
      queryLower.includes('remix') ||
      queryLower.includes('lofi') ||
      queryLower.includes('mashup');

    // Helper: score and select best song candidate from an array of song objects
    const scoreAndExtractSong = (songs: any[]) => {
      if (!Array.isArray(songs) || songs.length === 0) return null;

      const scored = songs.map((s) => {
        let score = 0;
        const titleLower = (s.song || s.title || '').toLowerCase();
        const descLower = (s.description || s.singers || s.music || s.primary_artists || '').toLowerCase();

        if (titleLower === queryLower) {
          score += 25;
        } else if (titleLower.startsWith(queryLower) || queryLower.startsWith(titleLower)) {
          score += 15;
        } else if (titleLower.includes(queryLower) || queryLower.includes(titleLower)) {
          score += 10;
        }

        if (artistHint && descLower.includes(artistHint.toLowerCase())) {
          score += 15;
        }

        if (!wantsMix) {
          if (descLower.includes('mix') || descLower.includes('remix') || descLower.includes('mashup')) {
            score -= 15;
          }
          if (descLower.includes('hits') || descLower.includes('collection') || descLower.includes('party')) {
            score -= 8;
          }
        }

        if (descLower.includes('soundtrack') || descLower.includes('original') || !descLower.includes('·')) {
          score += 5;
        }

        return { song: s, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.map((item) => item.song);
    };

    // Helper: decrypt and return a ResolvedTrack from a song object (or fetch its details if enc_url missing)
    const tryDecryptSong = async (rawSongObj: any, defaultTitle?: string): Promise<ResolvedTrack | null> => {
      let songObj = rawSongObj;
      let encUrl = songObj.encrypted_media_url || songObj.more_info?.encrypted_media_url;

      if (!encUrl && songObj.id) {
        try {
          const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${songObj.id}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
          const detailsRes = await fetchJson(detailsUrl, 3500);
          const resolvedObj = detailsRes?.songs?.[0] || detailsRes?.[songObj.id];
          if (resolvedObj) {
            songObj = { ...songObj, ...resolvedObj };
            encUrl = resolvedObj.encrypted_media_url || resolvedObj.more_info?.encrypted_media_url;
          }
        } catch {
          // Ignore details fetch failure
        }
      }

      if (!encUrl) return null;

      const decrypted = decryptDesEcb(encUrl, '38346591');
      if (!decrypted || !decrypted.startsWith('http')) return null;

      const highQualityUrl = decrypted.replace('_96.mp4', '_320.mp4').replace('_160.mp4', '_320.mp4');
      const cleanTitle = (songObj.song || songObj.title || defaultTitle || query)
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
      const cleanArtist = (songObj.singers || songObj.primary_artists || songObj.music || songObj.more_info?.music || songObj.description || 'Unknown Artist')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
      const artwork = songObj.image ? songObj.image.replace('150x150', '500x500') : undefined;
      const duration = Number(songObj.duration || songObj.more_info?.duration || 0);

      return {
        success: true,
        title: cleanTitle,
        artist: cleanArtist,
        artworkUrl: artwork,
        audioUrl: highQualityUrl,
        duration,
        source: 'catalog',
      };
    };

    // ── Stage 1: Autocomplete search (fastest for exact/partial song titles) ────────
    const searchUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
    const searchRes = await fetchJson(searchUrl, 3500);

    const directSongs = searchRes?.songs?.data;
    if (Array.isArray(directSongs) && directSongs.length > 0) {
      const candidates = scoreAndExtractSong(directSongs);
      if (candidates) {
        for (const candidate of candidates.slice(0, 3)) {
          const track = await tryDecryptSong(candidate, query);
          if (track) return track;
        }
      }
    }

    // ── Stage 2: Check matching playlists from autocomplete (e.g. "Arijit Singh - Love Songs") ──
    const playlists = searchRes?.playlists?.data;
    if (Array.isArray(playlists) && playlists.length > 0) {
      for (const pl of playlists.slice(0, 2)) {
        if (!pl.id) continue;
        try {
          const plDetailsUrl = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&listid=${pl.id}&_format=json&_marker=0`;
          const plRes = await fetchJson(plDetailsUrl, 3500);
          const plSongs = plRes?.songs;
          if (Array.isArray(plSongs) && plSongs.length > 0) {
            for (const s of plSongs.slice(0, 3)) {
              const track = await tryDecryptSong(s, s.song || s.title);
              if (track) return track;
            }
          }
        } catch {
          // Continue to next playlist
        }
      }
    }

    // ── Stage 3: Check matching albums from autocomplete ─────────────────────────
    const albums = searchRes?.albums?.data;
    if (Array.isArray(albums) && albums.length > 0) {
      const alb = albums[0];
      if (alb.id) {
        try {
          const albDetailsUrl = `https://www.jiosaavn.com/api.php?__call=album.getDetails&albumid=${alb.id}&_format=json&_marker=0`;
          const albRes = await fetchJson(albDetailsUrl, 3500);
          const albSongs = albRes?.songs;
          if (Array.isArray(albSongs) && albSongs.length > 0) {
            for (const s of albSongs.slice(0, 3)) {
              const track = await tryDecryptSong(s, s.song || s.title);
              if (track) return track;
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    // ── Stage 4: Full Catalog Search (for natural/descriptive search queries) ────
    const catalogSearchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&n=10&p=1&q=${encodeURIComponent(query)}`;
    const catalogRes = await fetchJson(catalogSearchUrl, 3500);
    const searchResults = catalogRes?.results;
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      const candidates = scoreAndExtractSong(searchResults);
      if (candidates) {
        for (const candidate of candidates.slice(0, 4)) {
          const track = await tryDecryptSong(candidate, query);
          if (track) return track;
        }
      }
    }

    // ── Stage 5: Cleaned Query or Artist Fallback Search ─────────────────────────
    const cleanTokens = query
      .replace(/\b(romantic|love songs|love song|love|sad songs|sad song|songs|song|audio|track|music|mp3|hits|best of|all songs)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const fallbackQuery = artistHint || (cleanTokens.length >= 3 && cleanTokens !== query ? cleanTokens : null);
    if (fallbackQuery) {
      const fbSearchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&n=10&p=1&q=${encodeURIComponent(fallbackQuery)}`;
      const fbRes = await fetchJson(fbSearchUrl, 3500);
      const fbResults = fbRes?.results;
      if (Array.isArray(fbResults) && fbResults.length > 0) {
        for (const candidate of fbResults.slice(0, 3)) {
          const track = await tryDecryptSong(candidate, fallbackQuery);
          if (track) return track;
        }
      }
    }

    return null;
  } catch (err) {
    logger.warn('JioSaavn resolution attempt failed', { query, err });
    return null;
  }
}

// ── Tier 2: Universal YouTube Audio Fallback ──────────────────────────────────

async function resolveFromYouTube(query: string): Promise<ResolvedTrack | null> {
  try {
    const videoId = await resolveYouTubeVideoId(query);
    if (!videoId) return null;

    return {
      success: true,
      title: query,
      artist: 'YouTube',
      videoId,
      source: 'youtube',
    };
  } catch (err) {
    logger.warn('YouTube fallback resolution failed', { query, err });
    return null;
  }
}

// ── Public Cascading Track Resolver ──────────────────────────────────────────

export async function resolveMusicTrack(query: string, artistHint?: string): Promise<ResolvedTrack> {
  const cleanQuery = query.trim();

  // 1. Check cache for instant sub-millisecond return
  const cached = getCachedTrack(cleanQuery);
  if (cached) {
    return cached;
  }

  // 2. Tier 1: Studio-grade CDN Stream (JioSaavn catalog)
  const catalogTrack = await resolveFromJioSaavn(cleanQuery, artistHint);
  if (catalogTrack && catalogTrack.audioUrl) {
    setCachedTrack(cleanQuery, catalogTrack);
    logger.info('Resolved studio audio stream from music catalog', {
      query: cleanQuery,
      title: catalogTrack.title,
      artist: catalogTrack.artist,
      audioUrl: catalogTrack.audioUrl,
    });
    return catalogTrack;
  }

  // 3. Tier 2: YouTube Fallback
  const ytTrack = await resolveFromYouTube(cleanQuery);
  if (ytTrack) {
    setCachedTrack(cleanQuery, ytTrack);
    logger.info('Resolved track from YouTube fallback', { query: cleanQuery, videoId: ytTrack.videoId });
    return ytTrack;
  }

  // 4. Default graceful fallback
  return {
    success: false,
    title: cleanQuery,
    artist: '',
    source: 'catalog',
  };
}

// ── Diagnostic & Self-Healing Maintenance ─────────────────────────────────────

export interface MediaDiagnosticsReport {
  timestamp: string;
  overallStatus: 'operational' | 'degraded' | 'down';
  tier1: {
    provider: 'JioSaavn Studio Catalog & CDN';
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    testQuery: string;
    resolvedTrack?: {
      title: string;
      artist: string;
      audioUrl: string;
      bitrate: string;
      cdnStatusCode?: number;
      cdnLatencyMs?: number;
    };
    error?: string;
  };
  tier2: {
    provider: 'YouTube Video Fallback';
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    testQuery: string;
    resolvedVideoId?: string;
    error?: string;
  };
  cacheStats: {
    size: number;
    clearedInvalidEntries: number;
  };
}

function probeCdnUrl(url: string, timeoutMs = 5000): Promise<{ statusCode?: number; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        url,
        {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: timeoutMs,
        },
        (res) => {
          resolve({
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ latencyMs: Date.now() - start, error: 'Probe timeout' });
      });
      req.on('error', (err) => {
        resolve({ latencyMs: Date.now() - start, error: err.message });
      });
      req.end();
    } catch (err: any) {
      resolve({ latencyMs: Date.now() - start, error: err?.message || 'Invalid URL' });
    }
  });
}

export async function diagnoseAndMaintainMediaProviders(): Promise<MediaDiagnosticsReport> {
  const timestamp = new Date().toISOString();
  const testQuery = 'Tum Mere Ho by Anuv Jain';
  const testDescriptiveQuery = 'Arijit Singh romantic love songs';

  // 1. Cache maintenance - purge any invalid or expired entries
  let clearedEntries = 0;
  for (const [key, track] of trackCache.entries()) {
    if (!track || (!track.audioUrl && !track.videoId)) {
      trackCache.delete(key);
      clearedEntries++;
    }
  }

  // 2. Probe Tier 1: JioSaavn Catalog & CDN Stream (tests both direct & descriptive queries)
  const tier1Start = Date.now();
  let tier1Status: 'healthy' | 'degraded' | 'down' = 'down';
  let tier1Error: string | undefined;
  let resolvedInfo: MediaDiagnosticsReport['tier1']['resolvedTrack'] | undefined;

  try {
    // Probe primary track
    let track = await resolveFromJioSaavn(testQuery);
    if (!track) {
      track = await resolveFromJioSaavn(testDescriptiveQuery, 'Arijit Singh');
    }

    if (track && track.audioUrl) {
      const cdnProbe = await probeCdnUrl(track.audioUrl, 5000);
      if (cdnProbe.statusCode && cdnProbe.statusCode >= 200 && cdnProbe.statusCode < 400) {
        tier1Status = 'healthy';
        resolvedInfo = {
          title: track.title,
          artist: track.artist,
          audioUrl: track.audioUrl,
          bitrate: track.audioUrl.includes('_320.mp4') ? '320kbps' : '160kbps',
          cdnStatusCode: cdnProbe.statusCode,
          cdnLatencyMs: cdnProbe.latencyMs,
        };
        // Pre-warm cache with healthy probe
        setCachedTrack(testQuery, track);
      } else {
        tier1Status = 'degraded';
        tier1Error = `CDN stream returned HTTP ${cdnProbe.statusCode || 'N/A'}: ${cdnProbe.error || 'Unknown error'}`;
      }
    } else {
      tier1Status = 'degraded';
      tier1Error = 'Catalog resolution returned no stream URL';
    }
  } catch (err: any) {
    tier1Status = 'down';
    tier1Error = err?.message || String(err);
  }
  const tier1Latency = Date.now() - tier1Start;

  // 3. Probe Tier 2: YouTube Fallback
  const tier2Start = Date.now();
  let tier2Status: 'healthy' | 'degraded' | 'down' = 'down';
  let tier2Error: string | undefined;
  let resolvedVideoId: string | undefined;

  try {
    const videoId = await resolveYouTubeVideoId(testQuery);
    if (videoId) {
      tier2Status = 'healthy';
      resolvedVideoId = videoId;
    } else {
      tier2Status = 'degraded';
      tier2Error = 'YouTube search returned no video ID';
    }
  } catch (err: any) {
    tier2Status = 'down';
    tier2Error = err?.message || String(err);
  }
  const tier2Latency = Date.now() - tier2Start;

  // Determine overall status
  const overallStatus =
    tier1Status === 'healthy'
      ? 'operational'
      : tier2Status === 'healthy'
      ? 'degraded'
      : 'down';

  logger.info('Media providers self-healing diagnostic completed', {
    overallStatus,
    tier1Status,
    tier2Status,
    tier1Latency,
    tier2Latency,
    clearedEntries,
  });

  return {
    timestamp,
    overallStatus,
    tier1: {
      provider: 'JioSaavn Studio Catalog & CDN',
      status: tier1Status,
      latencyMs: tier1Latency,
      testQuery,
      resolvedTrack: resolvedInfo,
      error: tier1Error,
    },
    tier2: {
      provider: 'YouTube Video Fallback',
      status: tier2Status,
      latencyMs: tier2Latency,
      testQuery,
      resolvedVideoId,
      error: tier2Error,
    },
    cacheStats: {
      size: trackCache.size,
      clearedInvalidEntries: clearedEntries,
    },
  };
}

