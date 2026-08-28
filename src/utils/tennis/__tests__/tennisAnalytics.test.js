import { describe, it, expect } from 'vitest';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
  buildLeagueCounts, buildRecentMatches,
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
  const roster4 = [...roster, { name: '정', grade: '동배' }];
  it('전원 회원 복식만 집계 — 게스트 낀 판·미반영은 번외로 통째 제외', () => {
    const rows = [
      ...doublesMatch({ a: ['갑', '을'], b: ['병', '정'], guests: [], winner: 'A' }),           // 전원 회원 → 집계
      ...doublesMatch({ a: ['갑', '을'], b: ['병', '민환'], guests: ['민환'], winner: 'A' }),    // 게스트 낀 판(league='투몽'이어도) → 번외 제외
      ...doublesMatch({ league: '미반영', guests: [], a: ['갑', '을'], b: ['병', '정'], winner: 'B' }),
    ];
    const out = buildDoublesStandings({ rows, roster: roster4 });
    // 전원회원 1판만 집계: 갑 1승, 병 1패 (게스트 판의 회원 행도 제외됨)
    expect(out.find(x => x.name === '갑')).toMatchObject({ games: 1, wins: 1, rate: 1 });
    expect(out.find(x => x.name === '병')).toMatchObject({ games: 1, losses: 1 });
    expect(out.some(x => x.name === '민환')).toBe(false);
  });
});

describe('buildLeagueCounts', () => {
  it('판 분류 수 — 전체 = 투몽 + 길로틴 + 번외', () => {
    const rows = [
      ...doublesMatch({ a: ['갑', '을'], b: ['병', '정'], guests: [], winner: 'A' }),        // 투몽
      ...doublesMatch({ a: ['갑', '을'], b: ['병', '민환'], guests: ['민환'], winner: 'A' }), // 번외(게스트)
      // 단식 2판: 전원회원(길로틴) + 게스트(번외)
      { date: '2026-08-01', game_id: 'g_s1', match_id: 'R9_C1', format: '단식', league: '길로틴', player: '갑', side: 'A', is_guest: false, result: '승' },
      { date: '2026-08-01', game_id: 'g_s1', match_id: 'R9_C1', format: '단식', league: '길로틴', player: '을', side: 'B', is_guest: false, result: '패' },
      { date: '2026-08-01', game_id: 'g_s2', match_id: 'R9_C2', format: '단식', league: '미반영', player: '갑', side: 'A', is_guest: false, result: '승' },
      { date: '2026-08-01', game_id: 'g_s2', match_id: 'R9_C2', format: '단식', league: '미반영', player: '민환', side: 'B', is_guest: true, result: '패' },
    ];
    const c = buildLeagueCounts({ rows });
    expect(c).toEqual({ tumong: 1, guillotine: 1, exhibition: 2, total: 4 });
    expect(c.tumong + c.guillotine + c.exhibition).toBe(c.total);
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

describe('buildTbRanking / buildBagelRanking / buildAceDfRanking — format 필터', () => {
  // 단식 행(tb_played=2, bagels_given=1, aces=4) + 복식 행(tb_played=3, bagels_given=2, aces=6) 혼합
  const mixedRows = [
    ...doublesMatch({ over: { format: '단식', tb_played: 2, tb_won: 2, bagels_given: 1, aces: 4, double_faults: 0 } }),
    ...doublesMatch({ over: { format: '복식', tb_played: 3, tb_won: 1, bagels_given: 2, aces: 6, double_faults: 2 } }),
  ];

  it('buildTbRanking: format=단식이면 복식 행 제외', () => {
    const result = buildTbRanking({ rows: mixedRows, roster, format: '단식' });
    const gap = result.find(x => x.name === '갑');
    expect(gap).toBeDefined();
    expect(gap.tbPlayed).toBe(2); // 단식만: tb_played=2
  });

  it('buildBagelRanking: format=복식이면 단식 베이글 제외', () => {
    const result = buildBagelRanking({ rows: mixedRows, roster, format: '복식' });
    const gap = result.find(x => x.name === '갑');
    expect(gap).toBeDefined();
    expect(gap.given).toBe(2); // 복식만: bagels_given=2
  });

  it('buildAceDfRanking: format=단식이면 복식 에이스 제외', () => {
    const result = buildAceDfRanking({ rows: mixedRows, roster, format: '단식' });
    const gap = result.find(x => x.name === '갑');
    expect(gap).toBeDefined();
    expect(gap.aces).toBe(4); // 단식만: aces=4
  });

  it('format 미전달 시 단식+복식 전체 집계 — 하위호환', () => {
    const tb = buildTbRanking({ rows: mixedRows, roster });
    expect(tb.find(x => x.name === '갑').tbPlayed).toBe(5); // 2+3
    const bagel = buildBagelRanking({ rows: mixedRows, roster });
    expect(bagel.find(x => x.name === '갑').given).toBe(3); // 1+2
    const ace = buildAceDfRanking({ rows: mixedRows, roster });
    expect(ace.find(x => x.name === '갑').aces).toBe(10); // 4+6
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

describe('buildRecentMatches', () => {
  const mk = (o) => ({
    player: '갑', date: '2026-08-10', input_time: '2026-08-10 20:00:00', round_idx: 1, court_id: 1,
    format: '복식', partner: '을', opponents_json: '["병","정"]', result: '승',
    games_won: 6, games_lost: 3, league: '투몽', ...o,
  });

  it('최신순 정렬(날짜↓→input_time↓→라운드↓) 상위 N개', () => {
    const rows = [
      mk({ date: '2026-08-01', round_idx: 1 }),
      mk({ date: '2026-08-17', input_time: '2026-08-17 20:00:00', round_idx: 1 }),
      mk({ date: '2026-08-17', input_time: '2026-08-17 20:00:00', round_idx: 3 }), // 같은 세션, 나중 라운드
      mk({ date: '2026-08-10', round_idx: 1 }),
    ];
    const out = buildRecentMatches({ rows, player: '갑', limit: 3 });
    expect(out).toHaveLength(3);
    expect(out[0].date).toBe('2026-08-17');            // 최신 날짜
    expect(out[1].date).toBe('2026-08-17');            // 같은 날 라운드3이 먼저
    expect(out[2].date).toBe('2026-08-10');            // 그 다음
  });

  it('행 필드: 종목·파트너·상대(파싱)·점수·승패', () => {
    const rows = [mk({ format: '복식', partner: '을', opponents_json: '["병","정"]', result: '패', games_won: 4, games_lost: 6 })];
    expect(buildRecentMatches({ rows, player: '갑', limit: 5 })[0]).toMatchObject({
      format: '복식', partner: '을', opponents: ['병', '정'], result: '패', gamesWon: 4, gamesLost: 6,
    });
  });

  it('손상된 opponents_json은 빈 배열로(행은 유지)', () => {
    const rows = [mk({ opponents_json: '{bad' })];
    const out = buildRecentMatches({ rows, player: '갑', limit: 5 });
    expect(out).toHaveLength(1);
    expect(out[0].opponents).toEqual([]);
  });

  it('본인 행만·기록 없으면 빈 배열', () => {
    const rows = [mk({ player: '을' })];
    expect(buildRecentMatches({ rows, player: '갑', limit: 5 })).toEqual([]);
  });
});

// ─── 선수 성적표 (전체지표) ─────────────────────────────
import { buildPlayerReportCard, isLeagueRow, guestMatchKeys } from '../tennisAnalytics';

// 단식 1판 = 2행 헬퍼.
function singlesMatch({ date = '2026-08-10', a = '갑', b = '을', winner = 'A', league = '길로틴',
  guests = [], gamesA = 6, gamesB = 3, over = {} } = {}) {
  const matchId = `R${++seq}_C1`;
  const mk = (player, side, opp, gw, gl) => ({
    date, season: 2026, game_id: `g_${date}`, match_id: matchId, format: '단식', league,
    player, side, is_guest: guests.includes(player), partner: '', opponents_json: JSON.stringify([opp]),
    result: (winner === side) ? '승' : '패', games_won: gw, games_lost: gl,
    tb_played: 0, tb_won: 0, bagels_given: 0, bagels_taken: 0, aces: '', double_faults: '', ...over,
  });
  return [mk(a, 'A', b, gamesA, gamesB), mk(b, 'B', a, gamesB, gamesA)];
}

describe('isLeagueRow', () => {
  it('회원끼리 길로틴(단식)/투몽(복식)만 리그, 게스트 낀 판·미반영·본인 게스트는 번외', () => {
    const rows = [
      ...singlesMatch({ a: '갑', b: '을', league: '길로틴' }),
      ...singlesMatch({ a: '갑', b: '손님', league: '길로틴', guests: ['손님'] }),
      ...singlesMatch({ a: '갑', b: '병', league: '미반영' }),
      ...doublesMatch({ a: ['갑', '을'], b: ['병', '정'], guests: [], league: '투몽' }),
    ];
    const guests = guestMatchKeys(rows);
    const gap = rows.filter(r => r.player === '갑');
    expect(gap.map(r => isLeagueRow(r, guests))).toEqual([true, false, false, true]);
    expect(isLeagueRow(rows.find(r => r.player === '손님'), guests)).toBe(false);
  });
});

describe('buildPlayerReportCard', () => {
  const rows = [
    ...singlesMatch({ a: '갑', b: '을', winner: 'A', gamesA: 6, gamesB: 2 }),                       // 갑 승 +4 / 을 패 -4
    ...singlesMatch({ a: '갑', b: '병', winner: 'B', gamesA: 4, gamesB: 6 }),                       // 갑 패 -2 / 병 승 +2
    ...doublesMatch({ a: ['갑', '을'], b: ['병', '정'], guests: [], winner: 'A', over: { games_won: 6, games_lost: 4 } }), // 모두 +2/-2? (아래 참고)
    ...singlesMatch({ a: '갑', b: '손님', winner: 'A', guests: ['손님'], gamesA: 6, gamesB: 0 }),   // 번외(게스트) 갑 승 +6
  ];

  it('기간 내 뛴 모든 선수를 모으고 종목별 승-패·승률·득실을 낸다 (게스트 표시)', () => {
    const out = buildPlayerReportCard({ rows });
    const names = out.map(x => x.name);
    expect(names).toEqual(expect.arrayContaining(['갑', '을', '병', '정', '손님']));
    const gap = out.find(x => x.name === '갑');
    expect(gap).toMatchObject({
      games: 4, wins: 3, losses: 1,
      singles: { games: 3, wins: 2, losses: 1 },
      doubles: { games: 1, wins: 1, losses: 0 },
      isGuest: false,
    });
    expect(gap.rate).toBeCloseTo(3 / 4);
    // 득실: 단식 (+4) + (-2) + 복식 (+2) + 번외 (+6) = +10
    expect(gap.gameDiff).toBe(10);
    expect(out.find(x => x.name === '손님')).toMatchObject({ isGuest: true, games: 1, wins: 0, losses: 1, gameDiff: -6 });
  });

  it('leagueOnly면 리그 판(길로틴/투몽, 회원끼리)만 집계하고 게스트는 빠진다', () => {
    const out = buildPlayerReportCard({ rows, leagueOnly: true });
    expect(out.some(x => x.name === '손님')).toBe(false);
    const gap = out.find(x => x.name === '갑');
    expect(gap).toMatchObject({ games: 3, wins: 2, losses: 1, gameDiff: 4 });
    expect(gap.singles).toMatchObject({ games: 2, wins: 1, losses: 1 });
  });

  it('format 지정 시 그 종목 판만 집계 (단/복식 토글 연동) — 다른 종목만 뛴 선수는 빠진다', () => {
    const singles = buildPlayerReportCard({ rows, format: '단식' });
    expect(singles.find(x => x.name === '갑')).toMatchObject({ games: 3, wins: 2, losses: 1, gameDiff: 8 });
    expect(singles.some(x => x.name === '정')).toBe(false);          // 정은 복식만 뛰었다
    const doubles = buildPlayerReportCard({ rows, format: '복식' });
    expect(doubles.find(x => x.name === '갑')).toMatchObject({ games: 1, wins: 1, losses: 0, gameDiff: 2 });
    expect(doubles.some(x => x.name === '손님')).toBe(false);         // 손님은 단식만
    expect(doubles.map(x => x.name).sort()).toEqual(['갑', '을', '병', '정'].sort());
  });

  it('기본 정렬: 승률↓ → 승↓ → 이름', () => {
    const out = buildPlayerReportCard({ rows });
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i];
      const ok = a.rate > b.rate || (a.rate === b.rate && (a.wins > b.wins || (a.wins === b.wins && a.name.localeCompare(b.name, 'ko') <= 0)));
      expect(ok).toBe(true);
    }
  });

  it('games_won/lost가 빈 셀(레거시)이면 득실 0으로 취급하고 승패는 그대로 센다', () => {
    const legacy = singlesMatch({ a: '갑', b: '을', winner: 'A', over: { games_won: '', games_lost: '' } });
    const out = buildPlayerReportCard({ rows: legacy });
    expect(out.find(x => x.name === '갑')).toMatchObject({ wins: 1, gameDiff: 0 });
  });

  it('빈 입력 → 빈 배열', () => {
    expect(buildPlayerReportCard({ rows: [] })).toEqual([]);
    expect(buildPlayerReportCard({})).toEqual([]);
  });
});
