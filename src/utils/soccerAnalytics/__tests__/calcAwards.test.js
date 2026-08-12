import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';

describe('calcAwards', () => {
  const logs = [
    // 필드 플레이어 (불꽃/자책용)
    { player: 'A', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-02', goals: 4, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'A', date: '2026-01-03', goals: 2, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 1 },
    { player: 'B', date: '2026-01-01', goals: 3, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0 },
    { player: 'C', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 3 },
    // 키퍼 G: keeper_games 2+1+3+2=8, conceded 0+0+1+0=1, cleansheets 1+1+0+1=3 → 실점률 0.125
    { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
    { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, cleansheets: 1, owngoals: 0 },
    { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 3, conceded: 1, cleansheets: 0, owngoals: 0 },
    { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
    // 키퍼 H: keeper_games 4, conceded 0, cleansheets 1 → 실점률 0 (최저), 클린시트는 1
    { player: 'H', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 4, conceded: 0, cleansheets: 1, owngoals: 0 },
    // 키퍼 L: keeper_games 2 (min 미달), conceded 0, cleansheets 1 → 클린시트엔 포함, 실점률엔 제외
    { player: 'L', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0 },
  ];

  it('fireStarter(세션 3골)는 제거됨 — 반환 키 자체가 없음', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.fireStarter).toBeUndefined();
  });

  it('keepers.cleanSheetKings: PG 누적 cleansheets 합 내림차순', () => {
    const r = calcAwards({ playerLogs: logs });
    // G 3, H 1, L 1 → 동률은 실점률 낮은 순(H,L 둘다 0) → 이름순 H,L
    expect(r.keepers.cleanSheetKings.map(x => x.player)).toEqual(['G', 'H', 'L']);
    const g = r.keepers.cleanSheetKings.find(x => x.player === 'G');
    expect(g.cleanSheets).toBe(3);
    expect(g.keeperGames).toBe(8);
    expect(g.concededRate).toBeCloseTo(0.125, 5);
  });

  it('keepers.stingiest: 경기당 실점 오름차순, 최소 키퍼경기 미달 제외', () => {
    const r = calcAwards({ playerLogs: logs, minKeeperGames: 4 });
    // 자격: G(8경기, 0.125), H(4경기, 0). L(2경기)은 제외
    expect(r.keepers.stingiest.map(x => x.player)).toEqual(['H', 'G']);
    expect(r.keepers.stingiest.find(x => x.player === 'H').concededRate).toBe(0);
    expect(r.keepers.stingiest.find(x => x.player === 'L')).toBeUndefined();
  });

  it('owngoalKings returns only players with >0 owngoals, sorted desc', () => {
    const r = calcAwards({ playerLogs: logs });
    expect(r.owngoalKings).toEqual([
      { player: 'C', total: 3 },
      { player: 'A', total: 1 },
    ]);
  });

  it('hatTricks: (player, date, match_id) 경기 단위 3골 이상만 카운트', () => {
    const eventLogs = [
      // X: 같은 경기 3골 → 해트트릭 1회 (동일 행 반복 = 연속골, dedupe 금지)
      { event_type: 'goal', player: 'X', date: '2026-01-01', match_id: 'R1_C1' },
      { event_type: 'goal', player: 'X', date: '2026-01-01', match_id: 'R1_C1' },
      { event_type: 'goal', player: 'X', date: '2026-01-01', match_id: 'R1_C1' },
      // X: 다른 날 같은 match_id 2골 → 미달 (date로 구분)
      { event_type: 'goal', player: 'X', date: '2026-01-02', match_id: 'R1_C1' },
      { event_type: 'goal', player: 'X', date: '2026-01-02', match_id: 'R1_C1' },
      // Y: 하루 3골이지만 3경기 분산 → 해트트릭 아님
      { event_type: 'goal', player: 'Y', date: '2026-01-01', match_id: 'R1_C1' },
      { event_type: 'goal', player: 'Y', date: '2026-01-01', match_id: 'R2_C1' },
      { event_type: 'goal', player: 'Y', date: '2026-01-01', match_id: 'R3_C1' },
      // Z: 한 경기 2골 + owngoal 1 → owngoal은 집계 제외라 미달
      { event_type: 'goal', player: 'Z', date: '2026-01-01', match_id: 'R4_C1' },
      { event_type: 'goal', player: 'Z', date: '2026-01-01', match_id: 'R4_C1' },
      { event_type: 'owngoal', player: 'Z', date: '2026-01-01', match_id: 'R4_C1' },
    ];
    const r = calcAwards({ playerLogs: [], eventLogs });
    expect(r.hatTricks).toEqual([{ player: 'X', count: 1 }]);
  });

  it('hatTricks: 4골도 1회, 두 경기 해트트릭이면 2회', () => {
    const g = (player, date, mid) => ({ event_type: 'goal', player, date, match_id: mid });
    const eventLogs = [
      g('X', '2026-01-01', 'R1_C1'), g('X', '2026-01-01', 'R1_C1'), g('X', '2026-01-01', 'R1_C1'), g('X', '2026-01-01', 'R1_C1'),
      g('X', '2026-01-08', 'R2_C1'), g('X', '2026-01-08', 'R2_C1'), g('X', '2026-01-08', 'R2_C1'),
    ];
    const r = calcAwards({ playerLogs: [], eventLogs });
    expect(r.hatTricks).toEqual([{ player: 'X', count: 2 }]);
  });

  it('owngoal 폴백: eventLogs에 owngoal 이벤트가 하나도 없으면 PG.owngoals 사용', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'X', date: '2026-01-01', match_id: 'R1_C1' },
    ];
    const r = calcAwards({ playerLogs: logs, eventLogs });
    // eventLogs는 비어있지 않지만 owngoal 이벤트가 없음 → PG 폴백 (C:3, A:1)
    expect(r.owngoalKings).toEqual([
      { player: 'C', total: 3 },
      { player: 'A', total: 1 },
    ]);
  });

  it('owngoal: eventLogs에 owngoal 이벤트가 있으면 그쪽이 진실 소스', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'D', date: '2026-01-01', match_id: 'R1_C1' },
      { event_type: 'owngoal', player: 'D', date: '2026-01-01', match_id: 'R2_C1' },
    ];
    const r = calcAwards({ playerLogs: logs, eventLogs });
    expect(r.owngoalKings).toEqual([{ player: 'D', total: 2 }]);
  });

  it('respects custom topN', () => {
    const r = calcAwards({ playerLogs: logs, topN: { cleanSheet: 1, stingiest: 1, owngoal: 1 } });
    expect(r.keepers.cleanSheetKings).toHaveLength(1);
    expect(r.keepers.stingiest).toHaveLength(1);
    expect(r.owngoalKings).toHaveLength(1);
  });
});
