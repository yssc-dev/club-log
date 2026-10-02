// src/utils/__tests__/cupInsights.test.js
// TDD: calcCupHeadToHead / calcCupKeepers / calcCupFieldDefense / calcCupAwards
import { describe, it, expect } from 'vitest';
import {
  calcCupHeadToHead,
  calcCupKeepers,
  calcCupFieldDefense,
  calcCupAwards,
} from '../cup/cupInsights';

// ── 공통 픽스처 ──────────────────────────────────────────────────────
const M = (over = {}) => ({
  tournament_id: 'CUP', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(['a1', 'a2', 'a3', 'a4', 'a5']),
  opponent_members_json: JSON.stringify(['b1', 'b2', 'b3', 'b4', 'b5']),
  our_score: 1, opponent_score: 0,
  our_gk: 'a1', opponent_gk: 'b1',
  is_extra: false, ...over,
});

const CUP = {
  meta: { id: 'CUP', name: 'CUP', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: ['a1', 'a2', 'a3', 'a4', 'a5'], order: 0 },
    { id: 't2', name: '팀B', captain: '', players: ['b1', 'b2', 'b3', 'b4', 'b5'], order: 1 },
    { id: 't3', name: '팀C', captain: '', players: ['c1', 'c2', 'c3'], order: 2 },
  ],
};

// ── calcCupHeadToHead ────────────────────────────────────────────────
describe('calcCupHeadToHead', () => {
  it('단방향 홈 승리 — cells[A][B] 승, cells[B][A] 패', () => {
    const r = calcCupHeadToHead({ matchRows: [M()], cup: CUP });
    expect(r.cells['팀A']['팀B']).toEqual({ games: 1, wins: 1, draws: 0, losses: 0, gf: 1, ga: 0 });
    expect(r.cells['팀B']['팀A']).toEqual({ games: 1, wins: 0, draws: 0, losses: 1, gf: 0, ga: 1 });
  });

  it('무승부는 양쪽 draws +1', () => {
    const r = calcCupHeadToHead({ matchRows: [M({ our_score: 1, opponent_score: 1 })], cup: CUP });
    expect(r.cells['팀A']['팀B']).toMatchObject({ games: 1, wins: 0, draws: 1, losses: 0 });
    expect(r.cells['팀B']['팀A']).toMatchObject({ games: 1, wins: 0, draws: 1, losses: 0 });
  });

  it('여러 번 만난 경우 누적', () => {
    const rows = [
      M({ our_score: 2, opponent_score: 1 }),               // A 승
      M({ our_team_name: '팀B', opponent_team_name: '팀A', our_score: 0, opponent_score: 0, match_idx: 2 }), // 무
      M({ our_score: 1, opponent_score: 3, match_idx: 3 }), // A 패
    ];
    const r = calcCupHeadToHead({ matchRows: rows, cup: CUP });
    expect(r.cells['팀A']['팀B']).toEqual({ games: 3, wins: 1, draws: 1, losses: 1, gf: 3, ga: 4 });
    expect(r.cells['팀B']['팀A']).toEqual({ games: 3, wins: 1, draws: 1, losses: 1, gf: 4, ga: 3 });
  });

  it('teams 순서 — 엔티티 순서 우선, 행 전용 팀은 ko 정렬로 뒤에', () => {
    const rows = [
      M({ our_team_name: '팀X', opponent_team_name: '팀Z' }),
      M({ our_team_name: '팀Y', opponent_team_name: '팀A', match_idx: 2 }),
    ];
    const r = calcCupHeadToHead({ matchRows: rows, cup: CUP });
    // 엔티티: 팀A(0), 팀B(1), 팀C(2); 행전용: 팀X, 팀Y, 팀Z (ko 정렬)
    expect(r.teams).toEqual(['팀A', '팀B', '팀C', '팀X', '팀Y', '팀Z']);
  });

  it('엔티티 팀은 경기 없어도 teams에 포함', () => {
    const r = calcCupHeadToHead({ matchRows: [], cup: CUP });
    expect(r.teams).toEqual(['팀A', '팀B', '팀C']);
    expect(r.cells).toEqual({});
  });

  it('짝 없는 팀 쌍은 cells 키 없음 (UI가 - 표시)', () => {
    const rows = [M(), M({ our_team_name: '팀B', opponent_team_name: '팀C', match_idx: 2 })];
    const r = calcCupHeadToHead({ matchRows: rows, cup: CUP });
    expect(r.cells['팀A']?.['팀C']).toBeUndefined(); // A vs C 는 없음
  });

  it('행 팀명의 "팀" 접두어를 무시해 엔티티 이름으로 표시', () => {
    // 엔티티 이름 "광땡", 행 이름 "팀광땡" → 같은 키 → 표시는 "광땡"
    const cup2 = {
      meta: CUP.meta,
      teams: [
        { id: 't1', name: '광땡', captain: '', players: ['a1', 'a2'], order: 0 },
        { id: 't2', name: '국뽕', captain: '', players: ['b1', 'b2'], order: 1 },
      ],
    };
    const rows = [M({ our_team_name: '팀광땡', opponent_team_name: '팀국뽕', our_score: 2, opponent_score: 1 })];
    const r = calcCupHeadToHead({ matchRows: rows, cup: cup2 });
    expect(r.teams).toEqual(['광땡', '국뽕']);
    expect(r.cells['광땡']['국뽕']).toMatchObject({ wins: 1 });
  });

  it('__proto__ 팀 이름이 Object.prototype을 오염시키지 않는다', () => {
    const rows = [M({ our_team_name: '__proto__', opponent_team_name: '팀B', our_score: 1, opponent_score: 0 })];
    const r = calcCupHeadToHead({ matchRows: rows, cup: CUP });
    // Object.fromEntries 로 own property 로 만들어야 한다
    expect(Object.prototype.hasOwnProperty.call(r.cells, '__proto__')).toBe(true);
    // 행전용 팀 __proto__ 의 셀 데이터가 정상
    const inner = Object.prototype.hasOwnProperty.call(r.cells, '__proto__')
      ? Object.getOwnPropertyDescriptor(r.cells, '__proto__').value
      : undefined;
    expect(inner?.['팀B']).toMatchObject({ games: 1, wins: 1 });
  });
});

// ── calcCupKeepers ───────────────────────────────────────────────────
describe('calcCupKeepers', () => {
  it('our_gk 실점 = opponent_score, opponent_gk 실점 = our_score', () => {
    const rows = [M({ our_score: 2, opponent_score: 1 })];
    const keepers = calcCupKeepers({ matchRows: rows });
    const a1 = keepers.find(k => k.name === 'a1');
    const b1 = keepers.find(k => k.name === 'b1');
    expect(a1).toMatchObject({ games: 1, conceded: 1, cleanSheets: 0 });
    expect(b1).toMatchObject({ games: 1, conceded: 2, cleanSheets: 0 });
  });

  it('클린시트 — 실점 0인 경기', () => {
    const rows = [M({ our_score: 0, opponent_score: 0 })];
    const keepers = calcCupKeepers({ matchRows: rows });
    expect(keepers.find(k => k.name === 'a1')).toMatchObject({ cleanSheets: 1 });
    expect(keepers.find(k => k.name === 'b1')).toMatchObject({ cleanSheets: 1 });
  });

  it('여러 경기 누적', () => {
    const rows = [
      M({ our_score: 1, opponent_score: 0 }),
      M({ our_score: 0, opponent_score: 2, match_idx: 2 }),
    ];
    const a1 = calcCupKeepers({ matchRows: rows }).find(k => k.name === 'a1');
    expect(a1).toMatchObject({ games: 2, conceded: 2, cleanSheets: 1 });
  });

  it('빈 GK 필드 무시', () => {
    const rows = [M({ our_gk: '', opponent_gk: 'b1' })];
    const keepers = calcCupKeepers({ matchRows: rows });
    expect(keepers.every(k => k.name !== '')).toBe(true);
    expect(keepers).toHaveLength(1);
    expect(keepers[0].name).toBe('b1');
  });

  it('concededRate = conceded/games, 소수점 2자리 Number', () => {
    const rows = [
      M({ our_score: 1, opponent_score: 0 }),
      M({ our_score: 0, opponent_score: 1, match_idx: 2 }),
      M({ our_score: 0, opponent_score: 2, match_idx: 3 }),
    ];
    const a1 = calcCupKeepers({ matchRows: rows }).find(k => k.name === 'a1');
    // 3경기 3실점 → 1.00
    expect(a1).toMatchObject({ games: 3, conceded: 3, concededRate: 1 });
    expect(typeof a1.concededRate).toBe('number');
  });

  it('정렬 — 경기수 내림 → 실점률 오름 → 이름 가나다', () => {
    // gk1: 2경기 0실점 rate=0.00
    // gk2: 2경기 2실점 rate=1.00
    // gk3: 1경기 0실점 rate=0.00
    // gk2 가 두 번째 경기에 없으므로: gk2=1경기2실점, gk3=1경기0실점
    const rows2 = [
      M({ our_gk: 'gk1', opponent_gk: 'gk2', our_score: 0, opponent_score: 1 }),
      M({ our_gk: 'gk1', opponent_gk: 'gk2', our_score: 0, opponent_score: 1, match_idx: 2 }),
      M({ our_gk: 'gk3', opponent_gk: 'gk4', our_score: 0, opponent_score: 0, match_idx: 3 }),
    ];
    // gk1: 2경기 2실점 rate=1.00; gk2: 2경기 0실점 rate=0.00; gk3: 1경기 0실점; gk4: 1경기 0실점
    const ks = calcCupKeepers({ matchRows: rows2 });
    expect(ks.map(k => k.name)).toEqual(['gk2', 'gk1', 'gk3', 'gk4']); // gk2,gk1 2경기, then gk3,gk4 1경기 rate 같으면 이름순
  });

  it('이름 가나다 정렬 — rate 같을 때', () => {
    const rows = [
      M({ our_gk: '나GK', opponent_gk: '가GK', our_score: 0, opponent_score: 0 }),
    ];
    const ks = calcCupKeepers({ matchRows: rows });
    expect(ks[0].name).toBe('가GK');
  });
});

// ── calcCupFieldDefense ──────────────────────────────────────────────
describe('calcCupFieldDefense', () => {
  it('GK는 필드 수비에서 제외', () => {
    const rows = [M({ our_gk: 'a1', our_score: 0, opponent_score: 1 })];
    const { rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    const all = [...rated, ...unrated];
    expect(all.every(p => p.name !== 'a1')).toBe(true);
    expect(all.some(p => p.name === 'a2')).toBe(true);
  });

  it('absent 제외 — .actual 만 사용', () => {
    const rows = [M({
      our_gk: 'a1',
      our_members_json: JSON.stringify({ players: ['a1', 'a2', 'a3', 'a4'], absent: ['a4'] }),
      our_score: 0, opponent_score: 1,
    })];
    const { rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    const all = [...rated, ...unrated];
    expect(all.every(p => p.name !== 'a4')).toBe(true); // a4는 휴식
    expect(all.some(p => p.name === 'a2')).toBe(true);
  });

  it('빈 GK 사이드 통째로 건너뜀', () => {
    const rows = [M({ our_gk: '', opponent_gk: 'b1', our_score: 0, opponent_score: 0 })];
    const { rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    const all = [...rated, ...unrated];
    // our side (gk empty) 는 건너뜀 → a1~a5 없음, b side 처리됨
    expect(all.every(p => !['a1', 'a2', 'a3', 'a4', 'a5'].includes(p.name))).toBe(true);
    expect(all.some(p => ['b2', 'b3', 'b4', 'b5'].includes(p.name))).toBe(true);
  });

  it('cleanSheets — 실점 0 경기', () => {
    const rows = [
      M({ our_gk: 'a1', our_score: 0, opponent_score: 0 }),
      M({ our_gk: 'a1', our_score: 0, opponent_score: 1, match_idx: 2 }),
    ];
    const { rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    const all = [...rated, ...unrated];
    const a2 = all.find(p => p.name === 'a2');
    expect(a2).toMatchObject({ games: 2, cleanSheets: 1, conceded: 1 });
  });

  it('cleanRate, concededPerGame — 소수점 2자리 Number', () => {
    const rows = [
      M({ our_gk: 'a1', our_score: 0, opponent_score: 0 }),
      M({ our_gk: 'a1', our_score: 0, opponent_score: 0, match_idx: 2 }),
      M({ our_gk: 'a1', our_score: 0, opponent_score: 3, match_idx: 3 }),
    ];
    const { rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    const a2 = [...rated, ...unrated].find(p => p.name === 'a2');
    expect(a2).toMatchObject({
      games: 3, cleanSheets: 2, conceded: 3,
      cleanRate: Number((2 / 3).toFixed(2)),
      concededPerGame: 1,
    });
    expect(typeof a2.cleanRate).toBe('number');
  });

  it('minGames = dynamicMin(maxGames)', () => {
    // a2 는 5경기, b2는 1경기; dynamicMin(5)=2 → b2 unrated
    const rows = Array.from({ length: 5 }, (_, i) =>
      M({ our_gk: 'a1', opponent_gk: 'b1', match_idx: i + 1, our_score: 0, opponent_score: 0 })
    );
    // b side의 b2~b5는 5경기 all played, a2~a5는 5경기
    // opponent side 중 b1 이외: b2~b5 → 5경기; our side 중 a1 이외: a2~a5 → 5경기
    // dynamicMin(5)=2 → 모두 rated
    const { minGames } = calcCupFieldDefense({ matchRows: rows });
    expect(minGames).toBe(2); // Math.ceil(5*0.3)=2
  });

  it('rated/unrated 분리 — games >= minGames 인 선수는 rated', () => {
    // a1=GK 5경기, a2 5경기 rated, b1=GK 1경기, b2 1경기 unrated
    const rows = Array.from({ length: 5 }, (_, i) =>
      M({
        our_gk: 'a1', opponent_gk: 'b1',
        our_members_json: JSON.stringify(['a1', 'a2']),
        opponent_members_json: JSON.stringify(['b1', 'b2']),
        match_idx: i + 1, our_score: 0, opponent_score: 0,
      })
    );
    const { minGames, rated, unrated } = calcCupFieldDefense({ matchRows: rows });
    // a2: 5 games; b2: 5 games; dynamicMin(5)=2 → both rated
    expect(minGames).toBe(2);
    expect(rated.map(p => p.name).sort()).toContain('a2');
    expect(rated.map(p => p.name).sort()).toContain('b2');
    expect(unrated).toHaveLength(0);
  });

  it('rated 정렬 — cleanRate 내림 → concededPerGame 오름 → games 내림 → 이름 가나다', () => {
    // opponent_gk='' → 상대 사이드 건너뜀, 홈 사이드만 집계
    // p1: 2games,2cs,0conceded,rate=1.00,cpg=0.00
    // p2: 3games,2cs,1conceded,rate=0.67,cpg=0.33
    // p3: 4games,2cs,2conceded,rate=0.50,cpg=0.50
    // dynamicMin(4)=2 → all rated
    const rows = [
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'p1', 'p2', 'p3']), our_score: 0, opponent_score: 0, opponent_gk: '', match_idx: 1 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'p1', 'p2', 'p3']), our_score: 0, opponent_score: 0, opponent_gk: '', match_idx: 2 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'p2', 'p3']), our_score: 0, opponent_score: 1, opponent_gk: '', match_idx: 3 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'p3']), our_score: 0, opponent_score: 1, opponent_gk: '', match_idx: 4 }),
    ];
    const { rated } = calcCupFieldDefense({ matchRows: rows });
    expect(rated[0].name).toBe('p1');
    expect(rated[1].name).toBe('p2');
    expect(rated[2].name).toBe('p3');
  });

  it('unrated 정렬 — games 내림 → 이름 가나다', () => {
    const rows = [
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'aa', 'bb', 'cc']), our_score: 0, opponent_score: 0, match_idx: 1 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'aa', 'bb']), our_score: 0, opponent_score: 0, match_idx: 2 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'aa', 'zz']), our_score: 0, opponent_score: 0, match_idx: 3 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'aa', 'bb', 'cc']), our_score: 0, opponent_score: 0, match_idx: 4 }),
      M({ our_gk: 'GK', our_members_json: JSON.stringify(['GK', 'aa', 'bb', 'cc']), our_score: 0, opponent_score: 0, match_idx: 5 }),
    ];
    // aa: 5 games, bb: 4 games, cc: 3 games, zz: 1 game
    // dynamicMin(5)=2 → aa(5),bb(4),cc(3) rated; zz(1) unrated
    const { unrated } = calcCupFieldDefense({ matchRows: rows });
    expect(unrated.map(p => p.name)).toEqual(['zz']);
  });

  it('빈 입력 → minGames:0, 빈 배열들', () => {
    expect(calcCupFieldDefense({ matchRows: [] })).toEqual({ minGames: 0, rated: [], unrated: [] });
  });
});

// ── calcCupAwards ────────────────────────────────────────────────────
const PLAYER = (over = {}) => ({ name: 'p1', team: '팀A', guest: false, goals: 0, assists: 0, cleanSheets: 0, ownGoals: 0, days: 1, ...over });
const KEEPER = (over = {}) => ({ name: 'k1', games: 3, conceded: 1, cleanSheets: 1, concededRate: 0.33, ...over });
const DEFENSE = (over = {}) => ({ minGames: 2, rated: [], unrated: [], ...over });
const DAYS1 = [{ date: '2026-10-01' }];
const DAYS2 = [{ date: '2026-10-01' }, { date: '2026-10-08' }];

describe('calcCupAwards', () => {
  it('카드 고정 순서: topScorer → topAssist → cleanSheet → keeper → defense → attendance', () => {
    const players = [
      PLAYER({ name: 'p1', goals: 3, assists: 2, days: 2 }),
      PLAYER({ name: 'p2', goals: 1, assists: 1, days: 2 }),
    ];
    const keepers = [
      KEEPER({ name: 'k1', games: 3, conceded: 0, cleanSheets: 3, concededRate: 0 }),
      KEEPER({ name: 'k2', games: 1, conceded: 2, cleanSheets: 0, concededRate: 2 }),
    ];
    const defense = DEFENSE({
      minGames: 1,
      rated: [{ name: 'd1', games: 3, conceded: 0, cleanSheets: 3, cleanRate: 1, concededPerGame: 0 }],
    });
    const cards = calcCupAwards({ players, keepers, defense, days: DAYS2 });
    const keys = cards.map(c => c.key);
    expect(keys).toEqual(['topScorer', 'topAssist', 'cleanSheet', 'keeper', 'defense', 'attendance']);
  });

  it('득점왕 타이 — 여러 이름 ko 정렬', () => {
    const players = [
      PLAYER({ name: '나B', goals: 3 }), PLAYER({ name: '가A', goals: 3 }), PLAYER({ name: '다C', goals: 1 }),
    ];
    const card = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.names).toEqual(['가A', '나B']); // ko 정렬
    expect(card.value).toBe('3골');
  });

  it('득점 0 → topScorer 카드 없음', () => {
    const cards = calcCupAwards({ players: [PLAYER()], keepers: [], defense: DEFENSE(), days: [] });
    expect(cards.find(c => c.key === 'topScorer')).toBeUndefined();
  });

  it('도움왕 타이 — value = n어시', () => {
    const players = [
      PLAYER({ name: 'a', assists: 2 }), PLAYER({ name: 'b', assists: 2 }),
    ];
    const card = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: [] })
      .find(c => c.key === 'topAssist');
    expect(card.value).toBe('2어시');
    expect(card.names).toHaveLength(2);
  });

  it('클린시트왕 — keepers에서 cleanSheets 최대', () => {
    const keepers = [
      KEEPER({ name: 'k1', cleanSheets: 2 }),
      KEEPER({ name: 'k2', cleanSheets: 2 }),
      KEEPER({ name: 'k3', cleanSheets: 1 }),
    ];
    const card = calcCupAwards({ players: [], keepers, defense: DEFENSE(), days: [] })
      .find(c => c.key === 'cleanSheet');
    expect(card.value).toBe('2경기');
    expect(card.names).toEqual(['k1', 'k2']);
  });

  it('수문장 — dynamicMin 진입 기준, 최저 실점률', () => {
    // maxKeeperGames=5, keeperMin=dynamicMin(5)=2
    // k1: 5games rate=0.20; k2: 1game rate=0.00 (games<2 → 불통)
    const keepers = [
      KEEPER({ name: 'k1', games: 5, conceded: 1, cleanSheets: 4, concededRate: 0.20 }),
      KEEPER({ name: 'k2', games: 1, conceded: 0, cleanSheets: 1, concededRate: 0.00 }),
    ];
    const card = calcCupAwards({ players: [], keepers, defense: DEFENSE(), days: [] })
      .find(c => c.key === 'keeper');
    expect(card.names).toEqual(['k1']);
    expect(card.note).toBe('최소 2경기');
  });

  it('수문장 — value는 실점률 x.xx 형식', () => {
    const keepers = [KEEPER({ games: 3, conceded: 1, concededRate: 0.33 })];
    const card = calcCupAwards({ players: [], keepers, defense: DEFENSE(), days: [] })
      .find(c => c.key === 'keeper');
    expect(card.value).toBe('실점률 0.33');
  });

  it('수비력 — defense.rated[0] 과 cleanRate 같은 선수 모두', () => {
    const defense = DEFENSE({
      minGames: 2,
      rated: [
        { name: '가', games: 3, conceded: 0, cleanSheets: 3, cleanRate: 1, concededPerGame: 0 },
        { name: '나', games: 2, conceded: 0, cleanSheets: 2, cleanRate: 1, concededPerGame: 0 },
        { name: '다', games: 2, conceded: 1, cleanSheets: 1, cleanRate: 0.5, concededPerGame: 0.5 },
      ],
    });
    const card = calcCupAwards({ players: [], keepers: [], defense, days: [] })
      .find(c => c.key === 'defense');
    expect(card.names).toEqual(['가', '나']); // rate=1 타이
    expect(card.value).toBe('무실점률 100%');
    expect(card.note).toBe('최소 2경기(필드)');
  });

  it('수비력 — defense.rated 비어있으면 카드 없음', () => {
    const cards = calcCupAwards({ players: [], keepers: [], defense: DEFENSE(), days: [] });
    expect(cards.find(c => c.key === 'defense')).toBeUndefined();
  });

  it('개근 — days.length === 1 이면 카드 없음', () => {
    const players = [PLAYER({ name: 'p1', days: 1 })];
    const cards = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: DAYS1 });
    expect(cards.find(c => c.key === 'attendance')).toBeUndefined();
  });

  it('개근 — days.length >= 2, 4명 이하 → names 배열 + n/n일 value', () => {
    const players = [
      PLAYER({ name: 'a', days: 2 }), PLAYER({ name: 'b', days: 2 }),
      PLAYER({ name: 'c', days: 1 }), // 한 번만
    ];
    const card = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: DAYS2 })
      .find(c => c.key === 'attendance');
    expect(card.names).toEqual(['a', 'b']); // ko 정렬
    expect(card.value).toBe('2/2일');
  });

  it('개근 — days.length >= 2, 5명 초과 → names=[], value = n명 · n/n일', () => {
    const players = Array.from({ length: 5 }, (_, i) => PLAYER({ name: `p${i + 1}`, days: 2 }));
    const card = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: DAYS2 })
      .find(c => c.key === 'attendance');
    expect(card.names).toEqual([]);
    expect(card.value).toBe('5명 · 2/2일');
  });

  it('개근 — 개근자 없으면 카드 없음 (days>=2여도)', () => {
    const players = [PLAYER({ name: 'p1', days: 1 })];
    const cards = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: DAYS2 });
    expect(cards.find(c => c.key === 'attendance')).toBeUndefined();
  });

  it('게스트도 득점왕/도움왕 자격', () => {
    const players = [
      PLAYER({ name: 'guest1', guest: true, goals: 5 }),
      PLAYER({ name: 'regular', guest: false, goals: 3 }),
    ];
    const card = calcCupAwards({ players, keepers: [], defense: DEFENSE(), days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.names).toEqual(['guest1']);
  });

  it('빈 입력 → 카드 없음', () => {
    const cards = calcCupAwards({ players: [], keepers: [], defense: DEFENSE(), days: [] });
    expect(cards).toHaveLength(0);
  });
});
