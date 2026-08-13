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
    { name: 'a', grade: '동배', seasonStartRank: 1 },
    { name: 'b', grade: '은배', seasonStartRank: 2 },
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

  it("sortBy:'points'는 포인트 내림차순, 동점은 승률→승수→이름", () => {
    // a(동배)가 b(은배)를 이김 → a: 1+5=6점, b: 0점. 승률은 a=1 > b=0.
    const rows = [
      pg({ player: 'a', result: '승', grade_at_date: '동배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31', sortBy: 'points' });
    expect(s.map(x => x.name)).toEqual(['a', 'b']);
    expect(s[0].points).toBe(6);
  });

  it("sortBy 미지정(기본 rate)은 기존 승률 정렬을 보존", () => {
    // b가 포인트는 더 높지만(업셋) a의 승률이 더 높으면 rate 기본은 a가 먼저.
    const rows = [
      pg({ player: 'a', result: '승', grade_at_date: '은배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
      pg({ player: 'a', result: '승', date: '2026-03-02', grade_at_date: '은배', match_id: 'R2_C1', side: 'A' }),
      pg({ player: 'b', result: '패', date: '2026-03-02', grade_at_date: '은배', match_id: 'R2_C1', side: 'B' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s[0].name).toBe('a'); // rate 1.0 > 0
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

  it('에이스/DF/타이브레이크/베이글이 누적된다', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    expect(s).toMatchObject({ aces: 3, doubleFaults: 1, tbPlayed: 1, tbWon: 1, bagelsGiven: 1, bagelsTaken: 1 });
  });

  it('기록 없는 선수는 0으로 채워진다', () => {
    const s = buildPlayerSummary({ rows, player: '없는사람' });
    expect(s.singles.games).toBe(0);
    expect(s.attendanceDates).toBe(0);
  });
});
