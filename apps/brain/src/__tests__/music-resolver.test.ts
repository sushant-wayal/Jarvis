import { describe, expect, it } from 'vitest';
import { diagnoseAndMaintainMediaProviders, resolveMusicTrack } from '../modules/media/music-resolver';

describe('Music Resolver & Self-Healing Media Diagnostics', () => {
  it('resolves 320kbps studio stream with metadata for popular songs', async () => {
    const track = await resolveMusicTrack('Tum Mere Ho by Anuv Jain');
    expect(track.success).toBe(true);
    expect(track.title).toContain('Mere Ho');
    expect(track.artist).toContain('Anuv Jain');
    expect(track.audioUrl).toBeDefined();
    expect(track.audioUrl).toMatch(/^https:\/\/aac\.saavncdn\.com\/.*_320\.mp4$/);
    expect(track.source).toBe('catalog');
  }, 10000);

  it('resolves dekha hazaro dafa', async () => {
    const track = await resolveMusicTrack('dekha hazaro dafa');
    console.log('TRACK RESOLVED FOR dekha hazaro dafa:', track);
    expect(track.success).toBe(true);
  }, 10000);

  it('runs diagnoseAndMaintainMediaProviders with live CDN probe and returns operational status', async () => {
    const report = await diagnoseAndMaintainMediaProviders();
    expect(report.timestamp).toBeDefined();
    expect(report.overallStatus).toBe('operational');
    expect(report.tier1.status).toBe('healthy');
    expect(report.tier1.resolvedTrack?.bitrate).toBe('320kbps');
    expect(report.tier1.resolvedTrack?.cdnStatusCode).toBe(200);
    expect(report.tier2.status).toBe('healthy');
    expect(report.cacheStats.size).toBeGreaterThanOrEqual(1);
  }, 15000);
});
