import { describe, it, expect } from 'vitest';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
} from '../tennisAnalytics';

const roster = [{ name: '갑', grade: '금배' }, { name: '을', grade: '은배' }, { name: '병', grade: '동배' }];

// 복식 1판 = 4행 헬퍼. overrides로 판별 필드 덮어쓰기.
let seq = 0;
function doublesMatch({ date = '2026-01-10', a = ['갑', '을'], b = ['병', '정'], winner = 'A',
  league = '투몽', guests = ['정'], over = {} } = {}) {
  const matchId = `R${++seq}_C1`;
  const mk = (player, side, mates, opps) => ({
    date, season: 2026, game_id: `legacy_${date}`, match_id: matchId, format: '복식', league,
    player, side, is_guest: guests.includes(player),
    partner: mates.find(x => x !== player),
    opponents_json: JSON.stringify(opps),
    result: (winner === side) ? '승' : '패',
    tb_played: 0, tb_won: 0, bagels_given: 0, bagels_taken: 0,
    aces: '', double_faults: '', ...over,
  });
  return [...a.map(p => mk(p, 'A', a, b)), ...b.map(p => mk(p, 'B', b, a))];
}

describe('buildDoublesStandings', () => {
  it('투몽 행만 집계하고 게스트·미반영은 제외, 명부 전원 표시', () => {
    const rows = [
      ...doublesMatch({ winner: 'A' }),
      ...doublesMatch({ league: '미반영', winner: 'B' }), // 순위표에서 무시
    ];
    const out = buildDoublesStandings({ rows, roster });
    expect(out.find(x => x.name === '갑')).toMatchObject({ games: 1, wins: 1, rate: 1 });
    expect(out.find(x => x.name === '병')).toMatchObject({ games: 1, losses: 1 });
    expect(out.some(x => x.name === '정')).toBe(false);
  });
});

describe('buildPairChemistry', () => {
  it('판 단위 중복 제거 + minGames 필터 + 미반영 포함', () => {
    const rows = [
      ...doublesMatch({ winner: 'A' }), ...doublesMatch({ winner: 'A' }),
      ...doublesMatch({ winner: 'B', league: '미반영' }),
    ];
    const out = buildPairChemistry({ rows, minGames: 3 });
    expect(out).toHaveLength(2); // 갑·을 3판, 병·정 3판 — 4행짜리 판이 1로 세어짐
    expect(out.find(p => p.players.join('') === '갑을')).toMatchObject({ games: 3, wins: 2, hasGuest: false });
    expect(out.find(p => p.players.includes('정')).hasGuest).toBe(true);
  });
});

describe('buildHeadToHead / buildPartnerBreakdown / buildMonthlyForm', () => {
  const rows = [
    ...doublesMatch({ date: '2026-01-10', winner: 'A' }),
    ...doublesMatch({ date: '2026-02-11', winner: 'B' }),
  ];
  it('상대전적은 상대편에 섰던 판을 개인 단위로 센다', () => {
    const h2h = buildHeadToHead({ rows, player: '갑', format: '복식' });
    expect(h2h.find(x => x.opponent === '병')).toMatchObject({ games: 2, wins: 1, losses: 1 });
  });
  it('파트너별 성적', () => {
    expect(buildPartnerBreakdown({ rows, player: '갑' })[0])
      .toMatchObject({ partner: '을', games: 2, wins: 1 });
  });
  it('월별 폼', () => {
    expect(buildMonthlyForm({ rows, player: '갑', format: '복식' })).toEqual([
      { month: '2026-01', games: 1, wins: 1, rate: 1 },
      { month: '2026-02', games: 1, wins: 0, rate: 0 },
    ]);
  });
});

describe('buildTbRanking / buildBagelRanking / buildAceDfRanking', () => {
  it('TB·베이글 합산, 에이스는 빈값(미기록) 행 제외', () => {
    const rows = [
      ...doublesMatch({ over: { tb_played: 1 } }).map(r => ({ ...r, tb_won: r.side === 'A' ? 1 : 0 })),
      ...doublesMatch({ over: { bagels_given: 1 } }).map(r => r.side === 'A' ? r : { ...r, bagels_given: 0, bagels_taken: 1 }),
      ...doublesMatch({ over: { aces: 3, double_faults: 1 } }),
    ];
    expect(buildTbRanking({ rows, roster })[0]).toMatchObject({ name: '갑', tbPlayed: 1, tbWon: 1, rate: 1 });
    expect(buildBagelRanking({ rows, roster }).find(x => x.name === '병')).toMatchObject({ taken: 1 });
    const ace = buildAceDfRanking({ rows, roster }).find(x => x.name === '갑');
    expect(ace).toMatchObject({ aces: 3, doubleFaults: 1, recordedGames: 1 }); // 빈값 2판 제외
  });
});

describe('buildYearlyRecords', () => {
  it('레거시+로그+통산 합산', () => {
    const legacyRows = [
      { season: 2024, format: '복식', player: '갑', wins: 10, losses: 5 },
      { season: 2025, format: '복식', player: '갑', wins: 20, losses: 10 },
      { season: 2025, format: '단식', player: '갑', wins: 7, losses: 3 },
    ];
    const rows = doublesMatch({ winner: 'A' });
    const out = buildYearlyRecords({ legacyRows, rows, player: '갑', format: '복식' });
    expect(out).toEqual([
      { season: '2024', wins: 10, losses: 5, rate: 10 / 15 },
      { season: '2025', wins: 20, losses: 10, rate: 20 / 30 },
      { season: '2026', wins: 1, losses: 0, rate: 1 },
      { season: '통산', wins: 31, losses: 15, rate: 31 / 46 },
    ]);
  });
  it('기록 없는 선수는 빈 배열 반환(통산 0-0 행 없음)', () => {
    expect(buildYearlyRecords({ legacyRows: [], rows: [], player: '갑', format: '복식' })).toEqual([]);
  });
});
