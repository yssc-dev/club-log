import { describe, it, expect } from 'vitest';
import { singlesWinRatesBefore, deriveLeagueForDate, priorYearSinglesOrder } from '../leagueDerivation';
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

  it('그 해 집계(seasonAggregate)를 상세에 가산해 승률을 낸다', () => {
    // 박성언 상세 2승0패 + 집계 2승2패 → 4승2패 = 0.667
    const m = singlesWinRatesBefore(rows, '2026-08-06', [
      { player: '박성언', wins: 2, losses: 2 },
      { player: '신규자', wins: 3, losses: 1 }, // 상세 없어도 집계만으로 등장
    ]);
    expect(m.get('박성언')).toEqual({ wins: 4, losses: 2, rate: 4 / 6 });
    expect(m.get('신규자')).toEqual({ wins: 3, losses: 1, rate: 0.75 });
  });
});

describe('deriveLeagueForDate', () => {
  const roster = (names) => names.map(n => ({ name: n }));

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

  it('시즌초 seedOrder(전년도 순위)로 가른다', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['a', 'b', 'c', 'd']),
      seedOrder: ['b', 'd', 'a', 'c'], // best→worst
    });
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.d).toBe(LEAGUE_BK);
    expect(out.a).toBe(LEAGUE_BR);
    expect(out.c).toBe(LEAGUE_BR);
  });

  it('seedOrder에 일부만 있으면 미시드는 뒤로 붙고 가나다순', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['하늘', '가람', '나무', '다솜']),
      seedOrder: ['나무', '다솜'],
    });
    expect(out['나무']).toBe(LEAGUE_BK);
    expect(out['다솜']).toBe(LEAGUE_BK);
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

  it('seasonAggregate(그 해 집계)만 있어도 recorded로 배치(시드 아님)', () => {
    // 상세 rows 없음, 2026 집계 승률만 → 집계 승률로 흑기사/흑장미 가름
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-08-01', roster: roster(['a', 'b', 'c', 'd']),
      seasonAggregate: [
        { player: 'a', wins: 9, losses: 1 }, // 0.9
        { player: 'b', wins: 6, losses: 4 }, // 0.6
        { player: 'c', wins: 4, losses: 6 }, // 0.4
        { player: 'd', wins: 1, losses: 9 }, // 0.1
      ],
      seedOrder: ['d', 'c', 'b', 'a'], // 시드는 반대로 줘도 집계(recorded)가 우선
    });
    expect(out.a).toBe(LEAGUE_BK);
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.c).toBe(LEAGUE_BR);
    expect(out.d).toBe(LEAGUE_BR);
  });

  it('로스터가 비면 빈 객체', () => {
    expect(deriveLeagueForDate({ rows: [], dateISO: '2026-08-06', roster: [] })).toEqual({});
  });
});

describe('priorYearSinglesOrder', () => {
  const rosterList = ['박성언', '김성환', '문형민'].map(n => ({ name: n }));

  it('전년도 단식 승률↓ 순 이름 배열 (상세 로우)', () => {
    const rows = [
      row('박성언', '2025-03-01', '승'), row('박성언', '2025-03-02', '승'), // 1.0
      row('김성환', '2025-03-01', '승'), row('김성환', '2025-03-02', '패'), // 0.5
      row('문형민', '2025-03-01', '패'),                                   // 0.0
      row('박성언', '2026-04-01', '패'),                                   // 올해 → 제외
    ];
    expect(priorYearSinglesOrder({ rows, legacyRows: [], roster: rosterList, year: '2026' }))
      .toEqual(['박성언', '김성환', '문형민']);
  });

  it('집계(legacy) 전적도 합산, 로스터·경기有만', () => {
    const legacyRows = [
      { season: '2025', format: '단식', player: '문형민', wins: 9, losses: 1 }, // 0.9
      { season: '2025', format: '단식', player: '김성환', wins: 1, losses: 9 }, // 0.1
      { season: '2024', format: '단식', player: '박성언', wins: 5, losses: 0 }, // 다른 연도 → 제외
      { season: '2025', format: '단식', player: '외부인', wins: 9, losses: 0 }, // 로스터 밖 → 제외
    ];
    expect(priorYearSinglesOrder({ rows: [], legacyRows, roster: rosterList, year: '2026' }))
      .toEqual(['문형민', '김성환']);
  });

  it('복식/게스트/미성립/league빈값은 제외 (인시즌과 동일 조건)', () => {
    const rows = [
      row('박성언', '2025-03-01', '승', '복식', '투몽'),      // 복식 제외
      { ...row('김성환', '2025-03-01', '승'), is_guest: true }, // 게스트 제외
      row('문형민', '2025-03-01', '승', '단식', '미반영'),      // 미성립 제외
      { player: '박성언', date: '2025-04-01', result: '승', format: '단식', league: undefined }, // league 빈값 제외
    ];
    expect(priorYearSinglesOrder({ rows, legacyRows: [], roster: rosterList, year: '2026' })).toEqual([]);
  });
});
