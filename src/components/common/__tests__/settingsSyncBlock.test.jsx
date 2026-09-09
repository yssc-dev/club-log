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

describe('풋살·축구 데이터셋 라벨', () => {
  const NOW4 = Date.parse('2026-09-09T10:00:00+09:00');
  it('7종 모두 한글 이름으로 표시된다', () => {
    const entries = [
      ['matchLog', 3], ['eventLog', 5], ['playerGameLog', 7], ['pointLog', 11],
      ['playerLog', 13], ['latestDeltas', 17], ['cumulativeBonus', 19],
    ].map(([dataset, count]) => ({ dataset, version: NOW4 - 60_000, count }));
    const s = formatSyncStatus(entries, NOW4);
    for (const label of ['매치', '이벤트', '선수경기', '포인트로그', '선수집계', '최근증감', '누적보너스']) {
      expect(s).toContain(label);
    }
    expect(s).not.toContain('matchLog');
  });
});

describe('raw 데이터셋은 count 가 null 이라 행수를 생략한다', () => {
  const NOW5 = Date.parse('2026-09-09T10:00:00+09:00');
  it("count 가 숫자가 아니면 '0행'을 표시하지 않고 라벨만 보여준다", () => {
    const s = formatSyncStatus([
      { dataset: 'matchLog', version: NOW5 - 60_000, count: 554 },
      { dataset: 'eventLog', version: NOW5 - 60_000, count: 1279 },
      { dataset: 'latestDeltas', version: NOW5 - 60_000, count: null },
      { dataset: 'cumulativeBonus', version: NOW5 - 60_000, count: null },
    ], NOW5);
    expect(s).toContain('매치 554행');
    expect(s).toContain('이벤트 1,279행');
    expect(s).toContain('최근증감');
    expect(s).toContain('누적보너스');
    expect(s).not.toContain('최근증감 0행');
    expect(s).not.toContain('누적보너스 0행');
  });
});
