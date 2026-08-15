import { describe, it, expect } from 'vitest';
import { buildSinglesStandings, buildPlayerSummary } from '../tennisStandings';
import { LEAGUE_BK } from '../tennisSchema';

const pg = (o) => ({
  player: 'x', date: '2026-03-01', format: '단식', league: '길로틴', result: '승',
  is_guest: false, side: 'A', match_id: 'R1_C1', grade_at_date: '동배',
  sets_won: 1, sets_lost: 0, games_won: 6, games_lost: 3,
  tb_played: 0, tb_won: 0, aces: 0, double_faults: 0,
  bagels_taken: 0, bagels_given: 0, opponents_json: '["y"]', partner: '', ...o,
});

describe('buildSinglesStandings', () => {
  const roster = [
    { name: 'a', grade: '동배' },
    { name: 'b', grade: '은배' },
  ];

  it('승률로 줄 세운다', () => {
    const rows = [
      pg({ player: 'a', result: '승' }), pg({ player: 'b', result: '패' }),
      pg({ player: 'a', result: '승', date: '2026-03-02' }), pg({ player: 'b', result: '패', date: '2026-03-02' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s[0].name).toBe('a');
    expect(s[0]).toMatchObject({ games: 2, wins: 2, losses: 0, rate: 1 });
    expect(s[1]).toMatchObject({ name: 'b', wins: 0, losses: 2, rate: 0 });
  });

  it('복식과 미반영 판은 제외한다', () => {
    const rows = [
      pg({ player: 'a', format: '복식', league: '투몽' }),
      pg({ player: 'a', league: '미반영' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === 'a').games).toBe(0);
  });

  it('용병은 순위표에 없다', () => {
    const rows = [pg({ player: '민환', is_guest: true })];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === '민환')).toBeUndefined();
  });

  it('기록이 없어도 로스터 전원이 나온다', () => {
    const s = buildSinglesStandings({ rows: [], roster, asOfDate: '2026-12-31' });
    expect(s).toHaveLength(2);
    expect(s[0].games).toBe(0);
  });

  it('리그 배치가 붙는다', () => {
    const s = buildSinglesStandings({ rows: [], roster, asOfDate: '2026-12-31' });
    expect(s[0].leagueTier).toBe(LEAGUE_BK);
  });

  it('포인트가 누적된다 — 같은 판의 양쪽 행을 짝지어 계산', () => {
    // a(동배)가 b(은배)를 이김 → 기본1 + 등급역전5 = 6
    const rows = [
      pg({ player: 'a', result: '승', grade_at_date: '동배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === 'a').points).toBe(6);
    expect(s.find(x => x.name === 'b').points).toBe(0);
  });

  it("sortBy로 rate/points 정렬이 갈린다 — 다른 순서를 만든다", () => {
    // 모두 같은 날(2026-03-01, pg 기본) → 사전승률 없음 → 전원 흑기사, 리그/승률 업셋 미발동.
    // 그래서 포인트는 기본승 + 등급업셋만.
    // a(은배)가 b(동배)를 2번 이김: 등급업셋 없음(2<1 거짓) → a 2점, 승률 2/3.
    // b(동배)가 a(은배)를 1번 이김: 하위등급이 상위 이김(1<2 참) → b 1+5=6점, 승률 1/3.
    const rosterAB = [{ name: 'a', grade: '은배' }, { name: 'b', grade: '동배' }];
    const rows = [
      pg({ player: 'a', result: '승', grade_at_date: '은배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '동배', match_id: 'R1_C1', side: 'B' }),
      pg({ player: 'a', result: '승', grade_at_date: '은배', match_id: 'R1_C2', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '동배', match_id: 'R1_C2', side: 'B' }),
      pg({ player: 'b', result: '승', grade_at_date: '동배', match_id: 'R1_C3', side: 'A' }),
      pg({ player: 'a', result: '패', grade_at_date: '은배', match_id: 'R1_C3', side: 'B' }),
    ];
    // 기본(rate): a(0.667) > b(0.333)
    const byRate = buildSinglesStandings({ rows, roster: rosterAB, asOfDate: '2026-12-31' });
    expect(byRate.map(x => x.name)).toEqual(['a', 'b']);
    // points: b(6) > a(2) — rate와 반대 순서
    const byPoints = buildSinglesStandings({ rows, roster: rosterAB, asOfDate: '2026-12-31', sortBy: 'points' });
    expect(byPoints.map(x => x.name)).toEqual(['b', 'a']);
    expect(byPoints[0]).toMatchObject({ name: 'b', points: 6 });
    expect(byPoints[1]).toMatchObject({ name: 'a', points: 2 });
  });

  it('사전(경기일 직전) 승률로 역전 보너스를 계산한다', () => {
    // 설계 근거:
    //   x, y가 day0에 a, b를 각각 꺾어 두 사람 모두 BK 최상위에 자리 잡는다.
    //   그 결과 day1·2에서 a와 b는 둘 다 BR 리그로 묶여 leagueUpset 경로가 없다.
    //   day1: a가 b를 이길 때 사전 승률이 같으므로(0:0) sameLeagueUpset 미발동 → a 1점.
    //   day2: b가 a를 이길 때 b의 사전 승률(0.0) < a의 사전 승률(0.5) → sameLeagueUpset 발동
    //         → b 1 + 2 = 3점.
    //   누적 승률 구현이면 day2에서 두 사람이 0.333으로 동률이라 보너스가 사라져 b는 1점만 받는다.
    const roster4 = [
      { name: 'x', grade: '동배' },
      { name: 'y', grade: '동배' },
      { name: 'a', grade: '동배' },
      { name: 'b', grade: '동배' },
    ];
    const rows = [
      // day0 (2026-03-01): x가 a를 꺾음, y가 b를 꺾음
      pg({ player: 'x', result: '승', date: '2026-03-01', grade_at_date: '동배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'a', result: '패', date: '2026-03-01', grade_at_date: '동배', match_id: 'R1_C1', side: 'B' }),
      pg({ player: 'y', result: '승', date: '2026-03-01', grade_at_date: '동배', match_id: 'R1_C2', side: 'A' }),
      pg({ player: 'b', result: '패', date: '2026-03-01', grade_at_date: '동배', match_id: 'R1_C2', side: 'B' }),
      // day1 (2026-03-02): a가 b를 꺾음 → a 1승1패(0.5), b 2패(0.0)
      pg({ player: 'a', result: '승', date: '2026-03-02', grade_at_date: '동배', match_id: 'R2_C1', side: 'A' }),
      pg({ player: 'b', result: '패', date: '2026-03-02', grade_at_date: '동배', match_id: 'R2_C1', side: 'B' }),
      // day2 (2026-03-03): b가 a를 꺾음 — 사전 승률로는 역전(b<a), 누적 승률로는 동률
      pg({ player: 'b', result: '승', date: '2026-03-03', grade_at_date: '동배', match_id: 'R3_C1', side: 'A' }),
      pg({ player: 'a', result: '패', date: '2026-03-03', grade_at_date: '동배', match_id: 'R3_C1', side: 'B' }),
    ];
    const s = buildSinglesStandings({ rows, roster: roster4, asOfDate: '2026-12-31' });
    const get = (n) => s.find(p => p.name === n);
    // b는 day2에 sameLeagueUpset 발동 → 3점; 누적 구현이면 1점만 나온다
    expect(get('b').points).toBe(3);
    expect(get('a').points).toBe(1);
    expect(get('x').points).toBe(1);
    expect(get('y').points).toBe(1);
  });

  it("legacySingles(집계 전적)는 전적·승률에 가산되고 포인트는 불변", () => {
    // rows 없음 + legacy로 a 10승 2패 → games 12, rate 10/12, points 0(로우 없음)
    const s = buildSinglesStandings({
      rows: [], roster, asOfDate: '2026-12-31',
      legacySingles: [{ player: 'a', wins: 10, losses: 2 }],
    });
    const a = s.find(x => x.name === 'a');
    expect(a).toMatchObject({ wins: 10, losses: 2, games: 12, points: 0 });
    expect(a.rate).toBeCloseTo(10 / 12);
    // 로스터 밖 이름은 무시(추가 안 됨)
    const s2 = buildSinglesStandings({
      rows: [], roster, asOfDate: '2026-12-31',
      legacySingles: [{ player: '용병X', wins: 5, losses: 0 }],
    });
    expect(s2.some(x => x.name === '용병X')).toBe(false);
  });
});

describe('buildPlayerSummary', () => {
  const rows = [
    pg({ player: 'a', date: '2026-03-01', result: '승', aces: 2, double_faults: 1, tb_played: 1, tb_won: 1, bagels_given: 1 }),
    pg({ player: 'a', date: '2026-03-01', format: '복식', league: '투몽', result: '패', partner: 'b', aces: 1, bagels_taken: 1 }),
    pg({ player: 'a', date: '2026-04-01', result: '패' }),
  ];

  it('단식/복식을 나눠 집계한다', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    expect(s.singles).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(s.doubles).toMatchObject({ games: 1, wins: 0, losses: 1 });
  });

  it('출석은 서로 다른 경기일 수 (뛴 날만)', () => {
    expect(buildPlayerSummary({ rows, player: 'a' }).attendanceDates).toBe(2);
  });

  it('에이스/DF/타이브레이크/베이글이 누적된다(합산 총계)', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    expect(s).toMatchObject({ aces: 3, doubleFaults: 1, tbPlayed: 1, tbWon: 1, bagelsGiven: 1, bagelsTaken: 1 });
  });

  it('에이스/DF/TB/베이글을 종목별로도 분리 집계한다', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    // 단식(row1 에이스2·DF1·TB1/1·준1, row3 없음), 복식(row2 에이스1·먹음1)
    expect(s.singles).toMatchObject({ aces: 2, doubleFaults: 1, tbPlayed: 1, tbWon: 1, bagelsGiven: 1, bagelsTaken: 0 });
    expect(s.doubles).toMatchObject({ aces: 1, doubleFaults: 0, tbPlayed: 0, tbWon: 0, bagelsGiven: 0, bagelsTaken: 1 });
  });

  it('기록 없는 선수는 0으로 채워진다', () => {
    const s = buildPlayerSummary({ rows, player: '없는사람' });
    expect(s.singles.games).toBe(0);
    expect(s.attendanceDates).toBe(0);
  });

  it('리그(길로틴/투몽)와 번외(미반영·게스트 낀 판)를 나눠 집계한다', () => {
    const rows2 = [
      // 단식 길로틴 승 (리그)
      pg({ player: 'a', result: '승', league: '길로틴', match_id: 'R1_C1', game_id: 'g1' }),
      // 단식 미반영 승 (번외)
      pg({ player: 'a', result: '승', league: '미반영', match_id: 'R2_C1', game_id: 'g2' }),
      // 복식 투몽, 게스트 없음 (리그)
      pg({ player: 'a', format: '복식', league: '투몽', result: '승', partner: 'b', match_id: 'R3_C1', game_id: 'g3' }),
      // 복식 투몽 라벨이지만 같은 매치에 게스트(z)가 낀 판 → 번외로 빠져야
      pg({ player: 'a', format: '복식', league: '투몽', result: '승', partner: 'b', match_id: 'R4_C1', game_id: 'g4' }),
      pg({ player: 'z', format: '복식', league: '투몽', result: '패', is_guest: true, match_id: 'R4_C1', game_id: 'g4' }),
    ];
    const s = buildPlayerSummary({ rows: rows2, player: 'a' });
    // 단식: 리그 1-0, 번외 1-0
    expect(s.singles).toMatchObject({ wins: 1, losses: 0, extraWins: 1, extraLosses: 0 });
    // 복식: 리그 1-0(g3), 번외 1-0(g4=게스트 오염)
    expect(s.doubles).toMatchObject({ wins: 1, losses: 0, extraWins: 1, extraLosses: 0 });
    expect(s.singles.rate).toBe(1);        // 리그 1/1
    expect(s.singles.extraRate).toBe(1);   // 번외 1/1
  });

  it('legacySingles는 리그(단식) 전적에만 가산 — 번외는 불변', () => {
    const rows2 = [
      pg({ player: 'a', result: '승', league: '길로틴', match_id: 'R1_C1', game_id: 'g1' }),
      pg({ player: 'a', result: '패', league: '미반영', match_id: 'R2_C1', game_id: 'g2' }), // 번외 0-1
    ];
    const s = buildPlayerSummary({ rows: rows2, player: 'a', legacySingles: [{ player: 'a', wins: 10, losses: 2 }] });
    expect(s.singles).toMatchObject({ wins: 11, losses: 2, games: 13 });      // 리그 1-0 + legacy 10-2
    expect(s.singles).toMatchObject({ extraWins: 0, extraLosses: 1 });        // 번외 불변
  });

  it('legacySingles는 단식 전적에만 가산 — 다른 지표(에이스·출석 등)는 로우만', () => {
    // 로우: a 단식 1승1패(games 2) + 복식 1패. legacy로 단식 5승3패 가산 → 6승4패(games 10).
    const s = buildPlayerSummary({ rows, player: 'a', legacySingles: [{ player: 'a', wins: 5, losses: 3 }] });
    expect(s.singles).toMatchObject({ wins: 6, losses: 4, games: 10 });
    expect(s.singles.rate).toBeCloseTo(6 / 10);
    expect(s.doubles).toMatchObject({ games: 1, wins: 0, losses: 1 }); // 복식 불변
    expect(s.aces).toBe(3);          // legacy는 에이스 미반영
    expect(s.attendanceDates).toBe(2); // 출석도 로우만
  });
});
