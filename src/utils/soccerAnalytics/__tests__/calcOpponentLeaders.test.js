import { describe, it, expect } from 'vitest';
import { calcOpponentLeaders } from '../calcOpponentLeaders';

const match = (i, opp, extra = {}) => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: '1', game_id: `s_${i}`,
  opponent_team_name: opp, our_members_json: '["A","B","C"]',
  our_score: 1, opponent_score: 0, ...extra,
});
const goal = (i, player, assist = '') => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: '1',
  event_type: 'goal', player, related_player: assist,
});

describe('calcOpponentLeaders', () => {
  it('legacy 경기는 리더보드에서 통째로 뺀다 — 출전 명단이 없어 분모 비교가 성립하지 않는다', () => {
    const matchLogs = [
      // legacy: L만 명단에 있고 골도 L이 넣음 → 그대로 두면 1.0P로 1위가 된다
      { date: '2026-01-06', match_id: '1', game_id: 'legacy_2026-01-06', opponent_team_name: '한울', our_members_json: '["L"]', our_score: 1, opponent_score: 0 },
      ...[0, 1, 2].map(i => match(i, '한울')),
    ];
    const eventLogs = [
      { date: '2026-01-06', match_id: '1', event_type: 'goal', player: 'L', related_player: '', opponent: '한울' },
      goal(0, 'A'),
    ];
    const r = calcOpponentLeaders({ eventLogs, matchLogs, minOpponentMatches: 3, minGames: 3 });
    const names = r.byOpponent['한울'].pointLeaders.map(x => x.name);
    expect(names).not.toContain('L');
    expect(names).toContain('A');
  });

  it('경기당 포인트는 높은 순, minGames 미만은 제외', () => {
    const matchLogs = [
      ...[0, 1, 2].map(i => match(i, '한울')),
      match(3, '한울', { our_members_json: '["D"]' }), // D는 1경기 → 제외
    ];
    const eventLogs = [goal(0, 'A', 'B'), goal(1, 'A'), goal(3, 'D')];
    const r = calcOpponentLeaders({ eventLogs, matchLogs, minOpponentMatches: 3, minGames: 3 });
    const leaders = r.byOpponent['한울'].pointLeaders;
    expect(leaders.map(x => x.name)).not.toContain('D');
    expect(leaders[0].name).toBe('A');          // 2골 / 3경기
    expect(leaders[0].pointsPerGame).toBeCloseTo(2 / 3);
    expect(leaders[1].name).toBe('B');          // 1어시 / 3경기
  });

  it('수비 리더는 실점 적은 순, our_defenders_json 기록 경기만', () => {
    const matchLogs = [
      ...[0, 1, 2].map(i => match(i, '한울', { our_defenders_json: '["A","B"]', opponent_score: 0 })),
      ...[3, 4, 5].map(i => match(i, '한울', { our_defenders_json: '["C"]', opponent_score: 2, our_members_json: '["C"]' })),
    ];
    const r = calcOpponentLeaders({ eventLogs: [], matchLogs, minOpponentMatches: 3, minGames: 3 });
    const d = r.byOpponent['한울'].defenseLeaders;
    expect(d[0].name).toBe('A');
    expect(d[0].concededPerGame).toBeCloseTo(0);
    expect(d.at(-1).name).toBe('C');
    expect(d.at(-1).concededPerGame).toBeCloseTo(2);
    expect(r.byOpponent['한울'].defenseMatches).toBe(6);
  });

  it('정식 기록 경기가 적은 상대팀은 목록에서 제외', () => {
    const matchLogs = [
      ...[0, 1, 2, 3, 4].map(i => match(i, '한울')),
      match(5, '시청'), // 1경기뿐
    ];
    const r = calcOpponentLeaders({ eventLogs: [], matchLogs, minOpponentMatches: 5, minGames: 1 });
    expect(r.opponents.map(o => o.opponent)).toEqual(['한울']);
    expect(r.byOpponent['시청']).toBeUndefined();
  });

  it('상대팀은 경기수 많은 순', () => {
    const matchLogs = [
      ...[0, 1, 2].map(i => match(i, '아이콘')),
      ...[3, 4, 5, 6].map(i => match(i, '한울')),
    ];
    const r = calcOpponentLeaders({ eventLogs: [], matchLogs, minOpponentMatches: 3, minGames: 1 });
    expect(r.opponents.map(o => o.opponent)).toEqual(['한울', '아이콘']);
    expect(r.opponents[0].matches).toBe(4);
  });

  it('topN으로 목록 길이를 자른다', () => {
    const roster = '["A","B","C","D","E","F","G"]';
    const matchLogs = [0, 1, 2].map(i => match(i, '한울', { our_members_json: roster }));
    const eventLogs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((p, i) => goal(i % 3, p));
    const r = calcOpponentLeaders({ eventLogs, matchLogs, minOpponentMatches: 3, minGames: 3, topN: 5 });
    expect(r.byOpponent['한울'].pointLeaders).toHaveLength(5);
  });

  it('is_extra 경기는 제외', () => {
    const matchLogs = [
      ...[0, 1, 2].map(i => match(i, '한울')),
      match(3, '한울', { is_extra: true }),
    ];
    const r = calcOpponentLeaders({ eventLogs: [], matchLogs, minOpponentMatches: 3, minGames: 1 });
    expect(r.byOpponent['한울'].matches).toBe(3);
  });

  it('데이터가 없으면 빈 결과', () => {
    const r = calcOpponentLeaders({ eventLogs: [], matchLogs: [] });
    expect(r.opponents).toEqual([]);
    expect(r.byOpponent).toEqual({});
  });
});
