// src/utils/__tests__/cupInsights.test.js
// TDD: calcCupHeadToHead / calcCupKeepers / calcCupAwards / calcCupOnOff / mergePlayerKeeperRecords
import { describe, it, expect } from 'vitest';
import {
  calcCupHeadToHead,
  calcCupKeepers,
  calcCupAwards,
  calcCupOnOff,
  mergePlayerKeeperRecords,
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

// ── calcCupAwards (재설계 2026-10-02) ──────────────────────────────
// rows 카드: { key, title, note?, rows:[{ rank, name, value, display, ratio }] }
// 개근 카드: { key, title, names, value }
const AP = (over = {}) => ({ name: 'p1', team: '팀A', guest: false, goals: 0, assists: 0, cleanSheets: 0, ownGoals: 0, days: 1, onGames: 0, goalImpact: null, defImpact: null, cleanRate: 0, ...over });
const AK = (over = {}) => ({ name: 'k1', games: 3, conceded: 1, cleanSheets: 1, concededRate: 0.33, ...over });
const AR = (over = {}) => ({ name: 'r1', team: '팀A', onGames: 5, offGames: 2, onGfPg: 2.5, offGfPg: 1, onGaPg: 0.5, offGaPg: 2.5, goalImpact: null, defImpact: null, cleanRate: 0, ...over });
const ADAYS1 = [{ date: '2026-10-01' }];
const ADAYS2 = [{ date: '2026-10-01' }, { date: '2026-10-08' }];

describe('calcCupAwards', () => {
  it('카드 순서: topScorer→topAssist→cleanSheet→keeper→goalImpact→defImpact→attendance (수비력 카드 없음)', () => {
    const players = [
      AP({ name: 'p1', goals: 3, assists: 2, days: 2 }),
      AP({ name: 'p2', goals: 1, assists: 1, days: 2 }),
    ];
    const keepers = [
      AK({ name: 'k1', games: 3, conceded: 0, cleanSheets: 3, concededRate: 0 }),
      AK({ name: 'k2', games: 1, conceded: 2, cleanSheets: 0, concededRate: 2 }),
    ];
    const onoff = {
      minOn: 1,
      rated: [
        AR({ name: 'd1', onGames: 3, cleanRate: 1, goalImpact: 1.5, defImpact: 0.8 }),
      ],
      unrated: [],
    };
    const cards = calcCupAwards({ players, keepers, onoff, days: ADAYS2 });
    const keys = cards.map(c => c.key);
    expect(keys).toEqual(['topScorer', 'topAssist', 'cleanSheet', 'keeper', 'goalImpact', 'defImpact', 'attendance']);
  });

  it('topN=3 기본: 상위 3개 rows', () => {
    const players = [
      AP({ name: 'a', goals: 5 }), AP({ name: 'b', goals: 3 }),
      AP({ name: 'c', goals: 2 }), AP({ name: 'd', goals: 1 }),
    ];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows).toHaveLength(3);
    expect(card.rows.map(r => r.name)).toEqual(['a', 'b', 'c']);
  });

  it('동률 포함 규칙: 4명이면 4행', () => {
    // 1위×2, 3위×2 → topN=3 이므로 3위(border) 동률 1명 추가 → 4행
    const players = [
      AP({ name: 'a', goals: 5 }), AP({ name: 'b', goals: 5 }),
      AP({ name: 'c', goals: 3 }), AP({ name: 'd', goals: 3 }),
    ];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows).toHaveLength(4);
    expect(card.rows.map(r => r.rank)).toEqual([1, 1, 3, 3]);
  });

  it('동률 포함 규칙: 6명 동률이면 5행(상한)', () => {
    // topN=3, 3위(border)와 동률이 6명이지만 total max 5
    const players = [
      AP({ name: 'a', goals: 5 }), AP({ name: 'b', goals: 5 }),
      AP({ name: 'c', goals: 3 }), AP({ name: 'd', goals: 3 }),
      AP({ name: 'e', goals: 3 }), AP({ name: 'f', goals: 3 }),
      AP({ name: 'g', goals: 3 }),
    ];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows).toHaveLength(5);
  });

  it('rank 경쟁 순위(1,1,3)', () => {
    const players = [
      AP({ name: 'a', goals: 5 }), AP({ name: 'b', goals: 5 }),
      AP({ name: 'c', goals: 3 }),
    ];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows.map(r => r.rank)).toEqual([1, 1, 3]);
  });

  it('득점왕 display 및 ratio', () => {
    const players = [AP({ name: 'a', goals: 4 }), AP({ name: 'b', goals: 2 })];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows[0].display).toBe('4골');
    expect(card.rows[0].ratio).toBe(1);
    expect(card.rows[1].ratio).toBeCloseTo(0.5);
  });

  it('득점 0 → topScorer 카드 없음', () => {
    const cards = calcCupAwards({ players: [AP()], keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] });
    expect(cards.find(c => c.key === 'topScorer')).toBeUndefined();
  });

  it('도움왕 display', () => {
    const players = [AP({ name: 'a', assists: 3 }), AP({ name: 'b', assists: 1 })];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topAssist');
    expect(card.rows[0].display).toBe('3어시');
  });

  it('클린시트왕 — keepers, display n경기, 동률 시 games 내림 타이브레이크', () => {
    const keepers = [
      AK({ name: 'k1', games: 3, cleanSheets: 2, concededRate: 0 }),
      AK({ name: 'k2', games: 1, cleanSheets: 2, concededRate: 0 }),
    ];
    const card = calcCupAwards({ players: [], keepers, onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'cleanSheet');
    expect(card.rows.map(r => r.display)).toEqual(['2경기', '2경기']);
    expect(card.rows.map(r => r.rank)).toEqual([1, 1]);
    expect(card.rows[0].name).toBe('k1'); // games 더 많은 k1이 앞
  });

  it('수문장 — dynamicMin 진입 기준, 최저 실점률 rows, ratio 역전(최저=1)', () => {
    // maxGames=5, dynamicMin(5)=2; k2(1game) 불통
    const keepers = [
      AK({ name: 'k1', games: 5, conceded: 1, cleanSheets: 4, concededRate: 0.20 }),
      AK({ name: 'k2', games: 1, conceded: 0, cleanSheets: 1, concededRate: 0.00 }),
      AK({ name: 'k3', games: 3, conceded: 2, cleanSheets: 1, concededRate: 0.67 }),
    ];
    const card = calcCupAwards({ players: [], keepers, onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'keeper');
    expect(card.note).toBe('최소 2경기');
    // k1(0.20) < k3(0.67) → k1 rank=1
    expect(card.rows[0].name).toBe('k1');
    expect(card.rows[0].rank).toBe(1);
    // ratio: 최저 실점률 k1(0.20)이 1위 → ratio=1
    expect(card.rows[0].ratio).toBe(1);
    // k3(0.67): ratio = Math.max(0.08, 1 - 0.67/0.67) = 0.08
    expect(card.rows[1].ratio).toBeCloseTo(0.08);
  });

  it('수문장 — 실점률 0 이면 ratio 전부 1', () => {
    const keepers = [
      AK({ name: 'k1', games: 5, conceded: 0, concededRate: 0 }),
      AK({ name: 'k2', games: 2, conceded: 0, concededRate: 0 }),
    ];
    const card = calcCupAwards({ players: [], keepers, onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'keeper');
    expect(card.rows.every(r => r.ratio === 1)).toBe(true);
  });

  it('수비력 카드는 만들지 않는다 — cleanRate>0 인 rated 가 있어도 defense 키 없음 (2026-10-02 대시보드 제거)', () => {
    const onoff = {
      minOn: 2,
      rated: [
        AR({ name: 'd1', onGames: 3, cleanRate: 0.80 }),
        AR({ name: 'd2', onGames: 5, cleanRate: 0.80 }),
      ],
      unrated: [],
    };
    const cards = calcCupAwards({ players: [], keepers: [], onoff, days: [] });
    expect(cards.find(c => c.key === 'defense')).toBeUndefined();
  });

  it('득점관여 — goalImpact>0 만, null 제외, note 포함', () => {
    const onoff = {
      minOn: 3,
      rated: [
        AR({ name: 'g1', onGames: 5, goalImpact: 1.50, defImpact: 0.5 }),
        AR({ name: 'g2', onGames: 4, goalImpact: 0.80, defImpact: null }),
        AR({ name: 'g3', onGames: 4, goalImpact: null,  defImpact: 1.0 }),
        AR({ name: 'g4', onGames: 4, goalImpact: -0.5, defImpact: 0.2 }),
      ],
      unrated: [],
    };
    const card = calcCupAwards({ players: [], keepers: [], onoff, days: [] })
      .find(c => c.key === 'goalImpact');
    expect(card).toBeDefined();
    expect(card.note).toBe('최소 3경기(필드) · 경기당 득점');
    expect(card.rows.map(r => r.name)).toEqual(['g1', 'g2']);
    expect(card.rows[0].display).toBe('+1.50');
    expect(card.rows[0].ratio).toBe(1);
    expect(card.rows[1].ratio).toBeCloseTo(0.8 / 1.5);
  });

  it('득점관여 — 각 행에 기준값 sub: 뛸 때 onGfPg · 없을 때 offGfPg (toFixed 2)', () => {
    const onoff = {
      minOn: 3,
      rated: [
        AR({ name: 'g1', onGames: 5, onGfPg: 2.5, offGfPg: 0.67, goalImpact: 1.83 }),
        AR({ name: 'g2', onGames: 4, onGfPg: 1, offGfPg: 0.5, goalImpact: 0.5 }),
      ],
      unrated: [],
    };
    const card = calcCupAwards({ players: [], keepers: [], onoff, days: [] })
      .find(c => c.key === 'goalImpact');
    expect(card.rows[0].sub).toBe('뛸 때 2.50 · 없을 때 0.67');
    expect(card.rows[1].sub).toBe('뛸 때 1.00 · 없을 때 0.50');
  });

  it('수비관여 — defImpact>0 만, null 제외', () => {
    const onoff = {
      minOn: 3,
      rated: [
        AR({ name: 'd1', onGames: 5, defImpact: 2.00, goalImpact: 0.5 }),
        AR({ name: 'd2', onGames: 4, defImpact: 1.00, goalImpact: null }),
        AR({ name: 'd3', onGames: 3, defImpact: null,  goalImpact: 0.1 }),
      ],
      unrated: [],
    };
    const card = calcCupAwards({ players: [], keepers: [], onoff, days: [] })
      .find(c => c.key === 'defImpact');
    expect(card.note).toBe('최소 3경기(필드) · 경기당 실점');
    expect(card.rows.map(r => r.name)).toEqual(['d1', 'd2']);
    expect(card.rows[0].display).toBe('+2.00');
  });

  it('수비관여 — 각 행에 기준값 sub: 뛸 때 onGaPg · 없을 때 offGaPg (실점, toFixed 2)', () => {
    const onoff = {
      minOn: 3,
      rated: [
        AR({ name: 'd1', onGames: 5, onGaPg: 0.5, offGaPg: 2.33, defImpact: 1.83 }),
      ],
      unrated: [],
    };
    const card = calcCupAwards({ players: [], keepers: [], onoff, days: [] })
      .find(c => c.key === 'defImpact');
    expect(card.rows[0].sub).toBe('뛸 때 0.50 · 없을 때 2.33');
  });

  it('득점왕 등 다른 카드 행에는 sub 가 없다', () => {
    const players = [AP({ name: 'a', goals: 5 })];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] })
      .find(c => c.key === 'topScorer');
    expect(card.rows[0].sub).toBeUndefined();
  });

  it('개근 — days.length===1 이면 카드 없음', () => {
    const players = [AP({ name: 'p1', days: 1 })];
    const cards = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: ADAYS1 });
    expect(cards.find(c => c.key === 'attendance')).toBeUndefined();
  });

  it('개근 — days.length>=2, 4명 이하 → names 배열 + n/n일', () => {
    const players = [
      AP({ name: 'a', days: 2 }), AP({ name: 'b', days: 2 }),
      AP({ name: 'c', days: 1 }),
    ];
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: ADAYS2 })
      .find(c => c.key === 'attendance');
    expect(card.names).toEqual(['a', 'b']);
    expect(card.value).toBe('2/2일');
  });

  it('개근 — days.length>=2, 5명 초과 → names=[], value=n명·n/n일', () => {
    const players = Array.from({ length: 5 }, (_, i) => AP({ name: `p${i + 1}`, days: 2 }));
    const card = calcCupAwards({ players, keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: ADAYS2 })
      .find(c => c.key === 'attendance');
    expect(card.names).toEqual([]);
    expect(card.value).toBe('5명 · 2/2일');
  });

  it('rows 비면 카드 없음 (goals=0, assists=0)', () => {
    const cards = calcCupAwards({ players: [AP()], keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] });
    expect(cards.find(c => c.key === 'topScorer')).toBeUndefined();
    expect(cards.find(c => c.key === 'topAssist')).toBeUndefined();
  });

  it('빈 입력 → 카드 없음', () => {
    const cards = calcCupAwards({ players: [], keepers: [], onoff: { minOn: 3, rated: [], unrated: [] }, days: [] });
    expect(cards).toHaveLength(0);
  });
});

// ── calcCupOnOff ─────────────────────────────────────────────────────
// 공통 헬퍼: 팀 A 단독(GK=gk, 필드=field members, 스코어=hs:as)
const OO = (over = {}) => ({
  tournament_id: 'CUP', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']),
  opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2', 'q3', 'q4']),
  our_score: 1, opponent_score: 0,
  our_gk: 'gkA', opponent_gk: 'gkB',
  is_extra: false, ...over,
});

const CUP_OO = {
  meta: { id: 'CUP', name: 'CUP', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: ['gkA', 'p1', 'p2', 'p3', 'p4'], order: 0 },
    { id: 't2', name: '팀B', captain: '', players: ['gkB', 'q1', 'q2', 'q3', 'q4'], order: 1 },
  ],
};

describe('calcCupOnOff', () => {
  // 1. 기본: 출전 2경기, 미출전 1경기 → 지표 계산
  it('기본 — on 2경기(2:0, 1:1), off 1경기(0:3) → onGfPg=1.5, defImpact=2.5', () => {
    const rows = [
      OO({ match_idx: 1, our_score: 2, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']) }),
      OO({ match_idx: 2, our_score: 1, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']) }),
      OO({ match_idx: 3, our_score: 0, opponent_score: 3,
           our_members_json: JSON.stringify(['gkA', 'p2', 'p3', 'p4']) }), // p1 off
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.onGames).toBe(2);
    expect(p1.offGames).toBe(1);
    expect(p1.onGfPg).toBe(1.5);
    expect(p1.onGaPg).toBe(0.5);
    expect(p1.offGfPg).toBe(0);
    expect(p1.offGaPg).toBe(3);
    expect(p1.goalImpact).toBe(1.5);
    expect(p1.defImpact).toBe(2.5);
  });

  // 2. GK 경기는 on/off 어디에도 포함되지 않음
  it('GK 경기는 on/off 양쪽 모두 제외', () => {
    // p1 이 GK 인 경기 1개, 필드 출전 2개 → onGames=2, offGames=0
    const rows = [
      OO({ match_idx: 1, our_gk: 'p1',
           our_members_json: JSON.stringify(['p1', 'p2', 'p3', 'p4', 'p5']) }), // p1=GK
      OO({ match_idx: 2, our_gk: 'gkA',
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']) }), // p1 field on
      OO({ match_idx: 3, our_gk: 'gkA',
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']) }), // p1 field on
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.onGames).toBe(2); // GK 경기 제외
    expect(p1.offGames).toBe(0);
    expect(p1.goalImpact).toBeNull();
    expect(p1.defImpact).toBeNull();
  });

  // 2b. 제외된 GK 경기 수를 gkGames 로 돌려준다 — 출전+미출전+GK = 소속팀 경기 수
  it('gkGames = 소속팀 경기 중 GK로 선 경기 수, onGames+offGames+gkGames = 팀 경기 수', () => {
    const rows = [
      OO({ match_idx: 1, our_gk: 'p1',
           our_members_json: JSON.stringify(['p1', 'p2', 'p3', 'p4', 'p5']) }), // p1=GK
      OO({ match_idx: 2, our_gk: 'gkA',
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3', 'p4']) }), // p1 on
      OO({ match_idx: 3, our_gk: 'gkA',
           our_members_json: JSON.stringify(['gkA', 'p2', 'p3', 'p4']) }),       // p1 off
      OO({ match_idx: 4, our_gk: 'p1',
           our_members_json: JSON.stringify(['p1', 'p2', 'p3', 'p4', 'p5']) }), // p1=GK
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1.gkGames).toBe(2);
    expect(p1.onGames + p1.offGames + p1.gkGames).toBe(4);
    // GK로 선 적 없는 p2: gkGames 0
    const p2 = all.find(e => e.name === 'p2');
    expect(p2.gkGames).toBe(0);
    expect(p2.onGames + p2.offGames + p2.gkGames).toBe(4);
  });

  it('gkGames — 상대팀 GK로 선 경기(소속팀 상대전)도 제외 경기로 센다', () => {
    // p1(팀A 소속)이 2경기째에 팀B GK 로 섰다 → 팀A 쪽 처리에서 제외되고 gkGames 1
    const rows = [
      OO({ match_idx: 1 }),
      OO({ match_idx: 2, opponent_gk: 'p1',
           our_members_json: JSON.stringify(['gkA', 'p2', 'p3', 'p4']),
           opponent_members_json: JSON.stringify(['p1', 'q1', 'q2', 'q3', 'q4']) }),
      OO({ match_idx: 3 }),
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const p1 = [...rated, ...unrated].find(e => e.name === 'p1');
    expect(p1.team).toBe('팀A');
    expect(p1.gkGames).toBe(1);
    expect(p1.onGames).toBe(2);
    expect(p1.offGames).toBe(0);
  });

  // 3. offGames < minOn 에 관계없이 unrated — onGames 기준만
  it('offGames=1 → onGames < minOn(3) 이면 unrated', () => {
    const rows = [
      OO({ match_idx: 1, our_score: 2, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3']) }),
      OO({ match_idx: 2, our_score: 1, opponent_score: 2,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3']) }),
      OO({ match_idx: 3, our_score: 0, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p2', 'p3']) }), // p1 off (1회)
    ];
    // p1: onGames=2, offGames=1 → 2 < 3(minOn 기본) → unrated
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const p1r = rated.find(e => e.name === 'p1');
    const p1u = unrated.find(e => e.name === 'p1');
    expect(p1r).toBeUndefined();       // rated 에 없음
    expect(p1u).toBeDefined();         // unrated
    expect(p1u.offGames).toBe(1);
    expect(typeof p1u.goalImpact).toBe('number'); // impact 는 숫자
    expect(typeof p1u.defImpact).toBe('number');
  });

  // 4. onGames < minOn → unrated
  it('onGames < minOn → unrated', () => {
    // 상대 명단을 비워 팀B 선수 집계를 배제 → maxOnGames 는 팀A만 결정
    // p2: bigRows 5경기 on → onGames=5, minOn=3(기본), 5>=3 → rated
    // p1: 1경기 on, 2경기 off → onGames=1 < 3 → unrated
    const bigRows = Array.from({ length: 5 }, (_, i) =>
      OO({ match_idx: i + 1, our_score: 1, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p2']),
           opponent_members_json: JSON.stringify([]) }) // 팀B 선수 배제
    );
    const p1Rows = [
      OO({ match_idx: 6, our_score: 1, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p1']),
           opponent_members_json: JSON.stringify([]) }), // p1 on (1)
      OO({ match_idx: 7, our_score: 0, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p2']),
           opponent_members_json: JSON.stringify([]) }), // p1 off
      OO({ match_idx: 8, our_score: 0, opponent_score: 2,
           our_members_json: JSON.stringify(['gkA', 'p2']),
           opponent_members_json: JSON.stringify([]) }), // p1 off
    ];
    const { minOn, rated, unrated } = calcCupOnOff({ matchRows: [...bigRows, ...p1Rows], cup: CUP_OO });
    expect(minOn).toBe(3); // 기본값
    expect(rated.find(e => e.name === 'p1')).toBeUndefined();
    expect(unrated.find(e => e.name === 'p1')).toBeDefined();
    const p1 = unrated.find(e => e.name === 'p1');
    expect(p1.onGames).toBe(1);
    expect(p1.onGames).toBeLessThan(minOn);
  });

  // 5. offGames=0 → offGfPg/offGaPg/goalImpact/defImpact 모두 null
  // onGames < minOn(3) 이면 unrated
  it('offGames=0 → null 지표; onGames < minOn 이면 unrated', () => {
    // p1 이 모든 경기에 출전, onGames=2
    const rows = [
      OO({ match_idx: 1, our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3']) }),
      OO({ match_idx: 2, our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3']) }),
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.offGames).toBe(0);
    expect(p1.offGfPg).toBeNull();
    expect(p1.offGaPg).toBeNull();
    expect(p1.goalImpact).toBeNull();
    expect(p1.defImpact).toBeNull();
    // onGames=2 < minOn=3 → unrated
    expect(rated.find(e => e.name === 'p1')).toBeUndefined();
    expect(unrated.find(e => e.name === 'p1')).toBeDefined();
  });

  // 6. onGames=0(필드 명단에 한 번도 없음) → 결과에 없음
  it('onGames=0 → 결과에 포함되지 않음', () => {
    // rX 는 어떤 경기 명단에도 없음
    const rows = [
      OO({ match_idx: 1, our_members_json: JSON.stringify(['gkA', 'p1', 'p2', 'p3']) }),
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    expect(all.find(e => e.name === 'rX')).toBeUndefined();
  });

  // 7. primary 팀: 두 팀 명단에 등장 → 더 많이 등장한 팀으로만 집계
  it('primary 팀 — 더 많이 등장한 팀으로만 집계, 상대 팀 출전은 primary 팀 기준 off', () => {
    // p1: 팀A 2경기, 팀B 1경기 → primary=팀A
    // matchRow 구조: 팀A vs 팀B 이므로 같은 행에 양 팀이 있음
    const rows = [
      // game1: 팀A 명단에 p1, 팀B 명단에 q1
      OO({ match_idx: 1, our_score: 2, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']) }),
      // game2: 팀A 명단에 p1, 팀B 명단에 q1
      OO({ match_idx: 2, our_score: 1, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']) }),
      // game3: 팀A 명단에 p1 없음, 팀B 명단에 p1 있음
      // p1 입장: 팀A의 game3 side에서는 off (팀A 명단에 없음)
      OO({ match_idx: 3, our_score: 0, opponent_score: 3,
           our_members_json: JSON.stringify(['gkA', 'p2', 'p3']),
           opponent_members_json: JSON.stringify(['gkB', 'p1', 'q2']) }),
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.team).toBe('팀A'); // primary = 팀A (2경기 > 1경기)
    expect(p1.onGames).toBe(2);  // game1, game2에서 팀A on
    expect(p1.offGames).toBe(1); // game3에서 팀A off (팀B로 뛰었어도 팀A 기준 off)
    expect(p1.onGfPg).toBe(1.5);
  });

  // 8. primary 팀 동률 → 엔티티 등록 팀 우선
  it('primary 팀 동률 → 엔티티 팀 우선', () => {
    // 팀A(엔티티), 팀X(행 전용)에 p1 각 1회씩 → 팀A 우선
    const cupWithX = {
      meta: CUP_OO.meta,
      teams: [
        { id: 't1', name: '팀A', captain: '', players: [], order: 0 }, // 엔티티
      ],
    };
    const rows = [
      OO({ match_idx: 1,
           our_team_name: '팀A', our_gk: 'gkA',
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_team_name: '팀X', opponent_gk: 'gkX',
           opponent_members_json: JSON.stringify(['gkX', 'p3', 'p4']),
           our_score: 1, opponent_score: 0 }),
      OO({ match_idx: 2,
           our_team_name: '팀X', our_gk: 'gkX',
           our_members_json: JSON.stringify(['gkX', 'p1', 'p3']),
           opponent_team_name: '팀A', opponent_gk: 'gkA',
           opponent_members_json: JSON.stringify(['gkA', 'p2', 'p4']),
           our_score: 0, opponent_score: 2 }),
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: cupWithX });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.team).toBe('팀A'); // 엔티티 팀 우선
  });

  // 9. 팀 표시명 = 엔티티 이름 ('팀광땡' 행 → '광땡')
  it('행 팀명 "팀광땡" → displayOf 엔티티명 "광땡"', () => {
    const cupGwang = {
      meta: CUP_OO.meta,
      teams: [
        { id: 'g1', name: '광땡', captain: '', players: ['gkG', 'p1', 'p2'], order: 0 },
        { id: 'g2', name: '팀B',  captain: '', players: ['gkB', 'q1', 'q2'], order: 1 },
      ],
    };
    const rows = [
      // 행에 "팀광땡" 으로 표기
      OO({ match_idx: 1,
           our_team_name: '팀광땡', our_gk: 'gkG',
           our_members_json: JSON.stringify(['gkG', 'p1', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 1, opponent_score: 0 }),
      OO({ match_idx: 2,
           our_team_name: '팀광땡', our_gk: 'gkG',
           our_members_json: JSON.stringify(['gkG', 'p1', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 2, opponent_score: 1 }),
      OO({ match_idx: 3,
           our_team_name: '팀광땡', our_gk: 'gkG',
           our_members_json: JSON.stringify(['gkG', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 0, opponent_score: 1 }), // p1 off
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: cupGwang });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.team).toBe('광땡'); // 엔티티 표시명
  });

  // 10. 정렬: goalImpact+defImpact 합 내림차순, null 은 맨 뒤
  it('정렬 — 합 내림 → onGames 내림 → name ko; null 은 맨 뒤', () => {
    // pa: goalImpact=1.50, defImpact=1.50 → sum=3.00 (아래 손계산 참조)
    // pb·pc: offGames=0 → goalImpact=null, defImpact=null → sum=-Inf (맨 뒤)
    const rows = [
      // pa: on 2경기(3:0, 1:0), off 2경기(1:2, 0:1)
      OO({ match_idx: 1, our_score: 3, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'pa', 'pb', 'pc']) }),
      OO({ match_idx: 2, our_score: 1, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'pa', 'pb', 'pc']) }),
      OO({ match_idx: 3, our_score: 1, opponent_score: 2,
           our_members_json: JSON.stringify(['gkA', 'pb', 'pc']) }), // pa off
      OO({ match_idx: 4, our_score: 0, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'pb', 'pc']) }), // pa off
      // pb: on 4경기, off 2경기(same as above + game3,4 on; off missing pa games above)
      // pc: on 4경기, off 0 → null impacts
    ];
    // pa: onGf=4,onGa=0,onGames=2; offGf=1,offGa=3,offGames=2
    //   onGfPg=2.00,onGaPg=0.00,offGfPg=0.50,offGaPg=1.50
    //   goalImpact=1.50,defImpact=1.50 → sum=3.00
    // pb: on all 4 games → offGames=0 → null
    // pc: on all 4 games → offGames=0 → null

    // minOn=2 로 pa(onGames=2)·pb/pc(onGames=4) 모두 rated 진입 → 정렬만 검증
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO, minOn: 2 });
    const all = [...rated, ...unrated];
    const names = all.map(e => e.name);
    // pa 는 null 아닌 impact → 앞에, pb·pc 는 null → 뒤
    expect(names.indexOf('pa')).toBeLessThan(names.indexOf('pb'));
    expect(names.indexOf('pa')).toBeLessThan(names.indexOf('pc'));
    // 손계산 값 고정 — 정렬만 보면 계산 회귀를 놓친다
    expect(all.find(e => e.name === 'pa')).toMatchObject({ onGames: 2, offGames: 2, goalImpact: 1.5, defImpact: 1.5 });
    expect(all.find(e => e.name === 'pb')).toMatchObject({ onGames: 4, offGames: 0, goalImpact: null, defImpact: null });
  });

  // 11. __proto__ 팀명이 있어도 예외 없음
  it('__proto__ 팀명 — Map 사용으로 예외 없음', () => {
    const rows = [
      OO({ match_idx: 1,
           our_team_name: '__proto__', our_gk: 'gkP',
           our_members_json: JSON.stringify(['gkP', 'p1', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 1, opponent_score: 0 }),
      OO({ match_idx: 2,
           our_team_name: '__proto__', our_gk: 'gkP',
           our_members_json: JSON.stringify(['gkP', 'p1', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 0, opponent_score: 2 }),
      OO({ match_idx: 3,
           our_team_name: '__proto__', our_gk: 'gkP',
           our_members_json: JSON.stringify(['gkP', 'p2']),
           opponent_team_name: '팀B', opponent_gk: 'gkB',
           opponent_members_json: JSON.stringify(['gkB', 'q1', 'q2']),
           our_score: 0, opponent_score: 1 }), // p1 off
    ];
    expect(() => calcCupOnOff({ matchRows: rows, cup: CUP_OO })).not.toThrow();
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.onGames).toBe(2);
    expect(p1.offGames).toBe(1);
  });

  // 12. 빈 입력 → { minOn:0, rated:[], unrated:[] }
  it('빈 입력 → { minOn:0, rated:[], unrated:[] }', () => {
    expect(calcCupOnOff({ matchRows: [], cup: CUP_OO }))
      .toEqual({ minOn: 0, rated: [], unrated: [] });
    expect(calcCupOnOff({}))
      .toEqual({ minOn: 0, rated: [], unrated: [] });
  });

  // 13. minOn 기본값 3
  it('minOn 기본 3 — onGames=3 이면 rated', () => {
    const rows = [
      OO({ match_idx: 1, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 2, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 3, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 4, our_members_json: JSON.stringify(['gkA', 'p2']),
           opponent_members_json: JSON.stringify([]) }), // p1 off
    ];
    const { minOn, rated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    expect(minOn).toBe(3);
    expect(rated.find(e => e.name === 'p1')).toBeDefined(); // onGames=3 >= 3 → rated
  });

  // 14. 옵션 minOn 으로 바꿀 수 있다
  it('옵션 minOn 으로 바꿀 수 있다 — minOn=2 이면 onGames=2 도 rated', () => {
    const rows = [
      OO({ match_idx: 1, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 2, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 3, our_members_json: JSON.stringify(['gkA', 'p2']),
           opponent_members_json: JSON.stringify([]) }), // p1 off
    ];
    const { minOn, rated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO, minOn: 2 });
    expect(minOn).toBe(2);
    // p1: onGames=2 >= 2 → rated
    expect(rated.find(e => e.name === 'p1')).toBeDefined();
  });

  // 15. offGames=0 이어도 onGames >= minOn 이면 rated, impact 는 null
  it('offGames=0 이어도 onGames >= 3 이면 rated 이고 impact 는 null', () => {
    // p1: 3경기 모두 on, offGames=0 → rated, goalImpact/defImpact=null
    const rows = [
      OO({ match_idx: 1, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 2, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
      OO({ match_idx: 3, our_members_json: JSON.stringify(['gkA', 'p1', 'p2']),
           opponent_members_json: JSON.stringify([]) }),
    ];
    const { rated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const p1 = rated.find(e => e.name === 'p1');
    expect(p1).toBeDefined();         // rated
    expect(p1.offGames).toBe(0);
    expect(p1.goalImpact).toBeNull(); // null because offGames=0
    expect(p1.defImpact).toBeNull();
  });

  // 16. cleanRate 계산 — 무실점 2/3 → 0.67
  it('cleanRate — on 3경기 중 2경기 실점 0 → cleanRate=0.67, onCleanSheets=2', () => {
    // p1 on 3경기: 첫 2경기 상대 실점 0(무실점), 마지막 1경기 상대 실점 1
    const rows = [
      OO({ match_idx: 1, our_score: 2, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 2, our_score: 1, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 3, our_score: 1, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 4, our_score: 0, opponent_score: 2,
           our_members_json: JSON.stringify(['gkA', 'p2']) }), // p1 off
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.onGames).toBe(3);
    expect(p1.onCleanSheets).toBe(2);
    expect(p1.cleanRate).toBe(Number((2 / 3).toFixed(2))); // 0.67
  });

  // 17. cleanRate — 무실점 0 → 0
  it('cleanRate — 무실점 경기 없으면 0', () => {
    // p1 on 3경기: 전부 실점 있음
    const rows = [
      OO({ match_idx: 1, our_score: 1, opponent_score: 2,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 2, our_score: 0, opponent_score: 1,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 3, our_score: 2, opponent_score: 3,
           our_members_json: JSON.stringify(['gkA', 'p1', 'p2']) }),
      OO({ match_idx: 4, our_score: 0, opponent_score: 0,
           our_members_json: JSON.stringify(['gkA', 'p2']) }), // p1 off
    ];
    const { rated, unrated } = calcCupOnOff({ matchRows: rows, cup: CUP_OO });
    const all = [...rated, ...unrated];
    const p1 = all.find(e => e.name === 'p1');
    expect(p1).toBeDefined();
    expect(p1.onCleanSheets).toBe(0);
    expect(p1.cleanRate).toBe(0);
  });
});

// ── mergePlayerKeeperRecords ─────────────────────────────────────────
describe('mergePlayerKeeperRecords', () => {
  const P = (over = {}) => ({
    name: 'p1', team: '팀A', guest: false,
    goals: 0, assists: 0, cleanSheets: 0, ownGoals: 0, days: 1, ...over,
  });
  const K = (over = {}) => ({
    name: 'k1', games: 3, conceded: 2, cleanSheets: 1, concededRate: 0.67, ...over,
  });

  it('일치하는 선수에 gkGames·gkConceded·gkRate 추가', () => {
    const players = [P({ name: 'k1' })];
    const keepers = [K({ name: 'k1', games: 3, conceded: 2, concededRate: 0.67 })];
    const result = mergePlayerKeeperRecords(players, keepers);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'k1',
      gkGames: 3,
      gkConceded: 2,
      gkRate: 0.67,
    });
  });

  it('keeper 에 없는 선수는 gkGames=0, gkConceded=0, gkRate=null', () => {
    const players = [P({ name: 'field1' })];
    const keepers = [K({ name: 'k1' })]; // field1 없음
    const result = mergePlayerKeeperRecords(players, keepers);
    expect(result[0]).toMatchObject({
      name: 'field1',
      gkGames: 0,
      gkConceded: 0,
      gkRate: null,
    });
  });

  it('keepers 에만 있는 이름은 결과에 추가되지 않음(players 순서 유지)', () => {
    const players = [P({ name: 'p1' }), P({ name: 'p2' })];
    const keepers = [K({ name: 'p1', games: 2 }), K({ name: 'gkOnly', games: 5 })];
    const result = mergePlayerKeeperRecords(players, keepers);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.name)).toEqual(['p1', 'p2']);
    expect(result[0].gkGames).toBe(2);
    expect(result[1].gkGames).toBe(0); // p2 는 keeper 없음
    expect(result.find(r => r.name === 'gkOnly')).toBeUndefined();
  });

  it('빈 입력 — players 빈 배열이면 빈 배열 반환', () => {
    expect(mergePlayerKeeperRecords([], [])).toEqual([]);
    expect(mergePlayerKeeperRecords([], [K()])).toEqual([]);
  });

  it('입력 배열 변이 없음 — 원본 players 항목이 수정되지 않음', () => {
    const original = P({ name: 'p1' });
    const players = [original];
    const keepers = [K({ name: 'p1', games: 4 })];
    mergePlayerKeeperRecords(players, keepers);
    // 원본에 gkGames 가 추가되지 않아야 한다
    expect(Object.prototype.hasOwnProperty.call(original, 'gkGames')).toBe(false);
  });
});
