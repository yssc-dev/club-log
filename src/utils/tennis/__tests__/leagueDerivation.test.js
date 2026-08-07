import { describe, it, expect } from 'vitest';
import { singlesWinRatesBefore, deriveLeagueForDate } from '../leagueDerivation';
import { LEAGUE_BK, LEAGUE_BR } from '../tennisSchema';

const row = (player, date, result, format = '단식', league = '길로틴') =>
  ({ player, date, result, format, league });

describe('singlesWinRatesBefore', () => {
  const rows = [
    row('박성언', '2026-03-01', '승'),
    row('박성언', '2026-03-01', '승'),
    row('박성언', '2026-08-06', '패'),          // 당일 — 제외돼야 함
    row('김성환', '2026-03-01', '패'),
    row('김성환', '2026-05-02', '승'),
    row('이승환', '2026-04-01', '승', '복식', '투몽'),   // 복식 — 제외
    row('신대철', '2026-04-01', '승', '단식', '미반영'), // 리그 미성립 — 제외
  ];

  it('경기일 당일 결과는 반영하지 않는다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.get('박성언')).toEqual({ wins: 2, losses: 0, rate: 1 });
  });

  it('복식과 리그 미성립 판은 승률에 안 들어간다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.has('이승환')).toBe(false);
    expect(m.has('신대철')).toBe(false);
  });

  it('승패를 섞어 승률을 낸다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.get('김성환')).toEqual({ wins: 1, losses: 1, rate: 0.5 });
  });
});

describe('deriveLeagueForDate', () => {
  const roster = (names, seeds = {}) =>
    names.map(n => ({ name: n, seasonStartRank: seeds[n] }));

  it('승률 순으로 상위 절반이 흑기사', () => {
    const rows = [
      row('a', '2026-03-01', '승'), row('a', '2026-03-02', '승'),
      row('b', '2026-03-01', '승'), row('b', '2026-03-02', '패'),
      row('c', '2026-03-01', '패'), row('c', '2026-03-02', '패'),
      row('d', '2026-03-01', '패'), row('d', '2026-03-02', '패'),
    ];
    const out = deriveLeagueForDate({ rows, dateISO: '2026-08-06', roster: roster(['a', 'b', 'c', 'd']) });
    expect(out.a).toBe(LEAGUE_BK);
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.c).toBe(LEAGUE_BR);
    expect(out.d).toBe(LEAGUE_BR);
  });

  it('홀수 인원이면 흑기사가 더 적다 (5명 → 2:3)', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].flatMap((n, i) =>
      Array.from({ length: 5 - i }, () => row(n, '2026-03-01', '승')));
    const out = deriveLeagueForDate({ rows, dateISO: '2026-08-06', roster: roster(['a', 'b', 'c', 'd', 'e']) });
    const bk = Object.values(out).filter(v => v === LEAGUE_BK);
    expect(bk).toHaveLength(2);
  });

  it('기록도 시드도 없으면 전원 흑기사 (리그 역전 보너스 미발생)', () => {
    const out = deriveLeagueForDate({ rows: [], dateISO: '2026-01-10', roster: roster(['a', 'b', 'c', 'd']) });
    expect(Object.values(out).every(v => v === LEAGUE_BK)).toBe(true);
  });

  it('시드가 있으면 시드 순으로 가른다', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['a', 'b', 'c', 'd'], { a: 3, b: 1, c: 4, d: 2 }),
    });
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.d).toBe(LEAGUE_BK);
    expect(out.a).toBe(LEAGUE_BR);
    expect(out.c).toBe(LEAGUE_BR);
  });

  it('시드가 일부만 있으면 미시드는 뒤로 붙고 가나다순', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['하늘', '가람', '나무', '다솜'], { 나무: 1, 다솜: 2 }),
    });
    expect(out['나무']).toBe(LEAGUE_BK);
    expect(out['다솜']).toBe(LEAGUE_BK);
    // 미시드 2명은 가나다순으로 3·4위 → 둘 다 흑장미
    expect(out['가람']).toBe(LEAGUE_BR);
    expect(out['하늘']).toBe(LEAGUE_BR);
  });

  it('기록 있는 사람이 기록 없는 사람보다 앞선다', () => {
    const rows = [row('무기록아님', '2026-03-01', '패')];
    const out = deriveLeagueForDate({
      rows, dateISO: '2026-08-06', roster: roster(['무기록아님', '무기록1', '무기록2', '무기록3']),
    });
    expect(out['무기록아님']).toBe(LEAGUE_BK);
  });

  it('로스터가 비면 빈 객체', () => {
    expect(deriveLeagueForDate({ rows: [], dateISO: '2026-08-06', roster: [] })).toEqual({});
  });
});
