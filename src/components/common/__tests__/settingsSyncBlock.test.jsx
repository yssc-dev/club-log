import { describe, it, expect } from 'vitest';
import { formatSyncStatus } from '../syncStatusText';

const NOW = Date.parse('2026-09-08T09:26:00+09:00');

describe('formatSyncStatus', () => {
  it('캐시가 없으면 안내 문구', () => {
    expect(formatSyncStatus([
      { dataset: 'roster', version: null, count: null },
    ], NOW)).toBe('아직 캐시 없음');
  });

  it('가장 오래된 동기화 시각과 경과를 보여준다', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: Date.parse('2026-09-08T09:14:00+09:00'), count: 42 },
      { dataset: 'playerGames', version: Date.parse('2026-09-08T09:20:00+09:00'), count: 2330 },
    ], NOW);
    expect(s).toContain('09:14');
    expect(s).toContain('12분 전');
    expect(s).toContain('명부 42행');
    expect(s).toContain('선수경기 2,330행');
  });

  it('1시간이 넘으면 시간 단위', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: NOW - 3 * 3600 * 1000, count: 1 },
    ], NOW);
    expect(s).toContain('3시간 전');
  });

  it('일부만 캐시된 경우 캐시된 것만 센다', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: NOW - 60_000, count: 5 },
      { dataset: 'legacy', version: null, count: null },
    ], NOW);
    expect(s).toContain('명부 5행');
    expect(s).not.toContain('레거시');
  });
});
