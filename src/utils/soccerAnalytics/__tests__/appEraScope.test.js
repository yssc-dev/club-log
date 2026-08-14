import { describe, it, expect } from 'vitest';
import { isLegacyMatch, scopeAppEra, appEraStart } from '../appEraScope';

const legacy = (date) => ({ date, game_id: `legacy_${date}_하버FC` });
const app = (date) => ({ date, game_id: `s_${date}` });

describe('isLegacyMatch', () => {
  it('game_id의 legacy_ 접두사로 앱 이전 경기를 가린다', () => {
    expect(isLegacyMatch(legacy('2026-01-06'))).toBe(true);
    expect(isLegacyMatch(app('2026-06-10'))).toBe(false);
  });

  it('game_id가 없거나 행 자체가 없어도 앱 이전으로 오인하지 않는다', () => {
    expect(isLegacyMatch({})).toBe(false);
    expect(isLegacyMatch(null)).toBe(false);
    expect(isLegacyMatch(undefined)).toBe(false);
  });
});

describe('scopeAppEra', () => {
  it('앱 기록 구간만 남긴다', () => {
    const rows = [legacy('2026-01-06'), app('2026-06-10'), legacy('2026-04-14'), app('2026-08-11')];
    expect(scopeAppEra(rows).map(m => m.date)).toEqual(['2026-06-10', '2026-08-11']);
  });

  it('빈 입력·null은 빈 배열', () => {
    expect(scopeAppEra([])).toEqual([]);
    expect(scopeAppEra(null)).toEqual([]);
    expect(scopeAppEra(undefined)).toEqual([]);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const rows = [legacy('2026-01-06'), app('2026-06-10')];
    scopeAppEra(rows);
    expect(rows).toHaveLength(2);
  });
});

describe('appEraStart', () => {
  // 캡션 문구를 하드코딩하지 않기 위한 것 — 데이터가 늘면 문구도 따라 움직여야 한다
  it('앱 기록 구간의 최초 날짜를 준다', () => {
    const rows = [app('2026-08-11'), legacy('2026-01-06'), app('2026-06-10')];
    expect(appEraStart(rows)).toBe('2026-06-10');
  });

  it('앱 기록 경기가 없으면 null — 캡션을 못 쓰는 상태를 구분한다', () => {
    expect(appEraStart([legacy('2026-01-06')])).toBeNull();
    expect(appEraStart([])).toBeNull();
    expect(appEraStart(null)).toBeNull();
  });

  it('날짜가 빈 행은 무시한다', () => {
    expect(appEraStart([{ game_id: 's_x', date: '' }, app('2026-06-10')])).toBe('2026-06-10');
  });
});
