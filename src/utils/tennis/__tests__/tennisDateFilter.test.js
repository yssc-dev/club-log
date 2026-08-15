import { describe, it, expect } from 'vitest';
import { availableYears, availableMonths, isRowYear, filterRowsByPeriod, buildLegacyStandings, legacySinglesForYear, aggregateLegacySingles } from '../tennisDateFilter';

const rows = [
  { date: '2026-01-05', player: 'A', format: '복식', result: '승' },
  { date: '2026-03-10', player: 'B', format: '복식', result: '패' },
  { date: '2026-08-02', player: 'A', format: '단식', result: '승' },
];
const legacy = [
  { player: 'A', season: '2025', format: '복식', wins: 10, losses: 5 },
  { player: 'B', season: '2025', format: '복식', wins: 3, losses: 7 },
  { player: 'A', season: '2024', format: '복식', wins: 2, losses: 1 },
];

describe('availableYears', () => {
  it('rows∪legacy 연도 내림차순', () => {
    expect(availableYears({ rows, legacyRows: legacy })).toEqual(['2026', '2025', '2024']);
  });
});
describe('availableMonths', () => {
  it('그 연도 로우의 월 오름차순', () => {
    expect(availableMonths({ rows, year: '2026' })).toEqual(['01', '03', '08']);
  });
  it('로우 없는 연도는 빈배열', () => {
    expect(availableMonths({ rows, year: '2025' })).toEqual([]);
  });
});
describe('isRowYear', () => {
  it('로우 있으면 true', () => { expect(isRowYear({ rows, year: '2026' })).toBe(true); });
  it('레거시연도 false', () => { expect(isRowYear({ rows, year: '2025' })).toBe(false); });
});
describe('filterRowsByPeriod', () => {
  it('연도 필터', () => { expect(filterRowsByPeriod(rows, { year: '2026', month: '' })).toHaveLength(3); });
  it('연+월 필터', () => {
    const r = filterRowsByPeriod(rows, { year: '2026', month: '03' });
    expect(r).toHaveLength(1); expect(r[0].player).toBe('B');
  });
  it('다른 연도 제외', () => { expect(filterRowsByPeriod(rows, { year: '2025', month: '' })).toHaveLength(0); });
});
describe('buildLegacyStandings', () => {
  it('연도+format 집계·정렬(승률↓)', () => {
    const s = buildLegacyStandings({ legacyRows: legacy, year: '2025', format: '복식' });
    expect(s.map(x => x.name)).toEqual(['A', 'B']);   // A 10/15=0.67 > B 3/10=0.3
    expect(s[0]).toMatchObject({ name: 'A', wins: 10, losses: 5, games: 15 });
    expect(s[0].rate).toBeCloseTo(10 / 15);
  });
  it('다른 연도/포맷은 제외', () => {
    expect(buildLegacyStandings({ legacyRows: legacy, year: '2024', format: '복식' }).map(x => x.name)).toEqual(['A']);
    expect(buildLegacyStandings({ legacyRows: legacy, year: '2025', format: '단식' })).toEqual([]);
  });
  it('빈 legacy 안전', () => { expect(buildLegacyStandings({ legacyRows: [], year: '2025', format: '복식' })).toEqual([]); });
});

describe('legacySinglesForYear', () => {
  const legacyRows = [
    { season: '2026', format: '단식', player: '박성언', wins: 71, losses: 4 },
    { season: '2026', format: '복식', player: '박성언', wins: 3, losses: 1 },  // 복식은 제외
    { season: '2025', format: '단식', player: '박성언', wins: 2, losses: 2 },  // 다른 연도 제외
  ];
  it('해당 연도 단식만 {player,wins,losses}로', () => {
    expect(legacySinglesForYear(legacyRows, '2026')).toEqual([{ player: '박성언', wins: 71, losses: 4 }]);
  });
  it('연도는 숫자/문자 무관, 빈 입력 안전', () => {
    expect(legacySinglesForYear(legacyRows, 2026)).toHaveLength(1);
    expect(legacySinglesForYear([], '2026')).toEqual([]);
    expect(legacySinglesForYear(undefined, '2026')).toEqual([]);
  });
});

describe('aggregateLegacySingles', () => {
  it('연도 무관 전 시즌 단식 W/L을 선수별 합산 (복식 제외)', () => {
    const legacyRows = [
      { season: '2024', format: '단식', player: '박성언', wins: 63, losses: 0 },
      { season: '2025', format: '단식', player: '박성언', wins: 101, losses: 3 },
      { season: '2026', format: '단식', player: '박성언', wins: 66, losses: 4 },
      { season: '2025', format: '복식', player: '박성언', wins: 9, losses: 9 }, // 복식 제외
      { season: '2026', format: '단식', player: '문형민', wins: 5, losses: 2 },
    ];
    const out = aggregateLegacySingles(legacyRows);
    expect(out).toContainEqual({ player: '박성언', wins: 230, losses: 7 });
    expect(out).toContainEqual({ player: '문형민', wins: 5, losses: 2 });
  });
  it('빈 입력 안전', () => {
    expect(aggregateLegacySingles([])).toEqual([]);
    expect(aggregateLegacySingles(undefined)).toEqual([]);
  });
  it('years 필터(문자열 Set)는 숫자 season도 String 강제로 매칭 — 상세연도만 집계', () => {
    const legacyRows = [
      { season: 2024, format: '단식', player: '박성언', wins: 63, losses: 0 },  // 숫자 season, 필터로 제외
      { season: 2025, format: '단식', player: '박성언', wins: 101, losses: 3 }, // 제외
      { season: 2026, format: '단식', player: '박성언', wins: 66, losses: 4 },  // 숫자 2026, 포함
    ];
    // years는 date.slice(0,4)에서 온 문자열 Set
    expect(aggregateLegacySingles(legacyRows, new Set(['2026'])))
      .toEqual([{ player: '박성언', wins: 66, losses: 4 }]);
    // years 미지정이면 전 시즌 합산(하위호환)
    expect(aggregateLegacySingles(legacyRows)).toEqual([{ player: '박성언', wins: 230, losses: 7 }]);
  });
});
