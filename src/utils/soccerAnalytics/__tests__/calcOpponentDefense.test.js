import { describe, it, expect } from 'vitest';
import { calcOpponentDefense } from '../calcOpponentDefense';

const m = (i, opp, defenders, conceded, extra = {}) => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: '1', game_id: `s_${i}`,
  opponent_team_name: opp, our_defenders_json: JSON.stringify(defenders),
  our_score: 1, opponent_score: conceded, ...extra,
});

describe('calcOpponentDefense', () => {
  it('상대팀별로 수비수의 경기당 실점을 낸다', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', ['A', 'B'], 0),
      m(1, '한울', ['A', 'B'], 2),
      m(2, '아이콘', ['A'], 3),
    ] });
    const a한울 = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a한울.games).toBe(2);
    expect(a한울.conceded).toBe(2);
    expect(a한울.concededPerGame).toBeCloseTo(1);
    // 상대팀별로 독립 집계 — 아이콘 실점이 한울에 섞이지 않는다
    expect(r.byPlayer['A'].find(x => x.opponent === '아이콘').concededPerGame).toBeCloseTo(3);
  });

  it('실점 적은 순으로 순위, 모집단은 그 상대팀 수비수 수', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', ['A'], 0),
      m(1, '한울', ['B'], 1),
      m(2, '한울', ['C'], 2),
    ] });
    expect(r.byPlayer['A'][0].rank).toBe(1);
    expect(r.byPlayer['B'][0].rank).toBe(2);
    expect(r.byPlayer['C'][0].rank).toBe(3);
    expect(r.byPlayer['A'][0].pool).toBe(3);
  });

  it('동점은 공동 순위, 다음 순위는 건너뛴다', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', ['A', 'B'], 0), // A·B 둘 다 0실점
      m(1, '한울', ['C'], 2),
    ] });
    expect(r.byPlayer['A'][0].rank).toBe(1);
    expect(r.byPlayer['B'][0].rank).toBe(1);
    expect(r.byPlayer['C'][0].rank).toBe(3); // 2가 아니라 3
  });

  it('수비수 기록이 없는 경기는 집계에서 빠진다', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', [], 2),
      m(1, '한울', ['A'], 1),
    ] });
    expect(r.byPlayer['A'][0].games).toBe(1);
    expect(r.byPlayer['A'][0].concededPerGame).toBeCloseTo(1);
  });

  it('is_extra 매치는 제외', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', ['A'], 5, { is_extra: true }),
      m(1, '한울', ['A'], 1),
    ] });
    expect(r.byPlayer['A'][0].games).toBe(1);
  });

  it('수비 기록이 아예 없으면 그 선수 항목 자체가 없다 — 화면이 "없음"을 띄울 수 있게', () => {
    const r = calcOpponentDefense({ matchLogs: [m(0, '한울', ['A'], 1)] });
    expect(r.byPlayer['B']).toBeUndefined();
    expect(r.byPlayer['A'].find(x => x.opponent === '아이콘')).toBeUndefined();
  });

  it('byOpponent로 상대팀별 순위 정렬 목록을 낸다 — 차트가 이웃 순위를 그리는 데 쓴다', () => {
    const r = calcOpponentDefense({ matchLogs: [
      m(0, '한울', ['A'], 2),
      m(1, '한울', ['B'], 0),
      m(2, '한울', ['C'], 1),
    ] });
    const list = r.byOpponent['한울'];
    expect(list.map(x => x.name)).toEqual(['B', 'C', 'A']); // 0, 1, 2 실점
    expect(list.map(x => x.rank)).toEqual([1, 2, 3]);
    expect(list[0]).toMatchObject({ games: 1, concededPerGame: 0 });
  });

  it('빈 입력에 안전', () => {
    expect(calcOpponentDefense({ matchLogs: [] }).byPlayer).toEqual({});
    expect(calcOpponentDefense({}).byPlayer).toEqual({});
  });

  it('중복 이름은 한 번만 집계', () => {
    const r = calcOpponentDefense({ matchLogs: [m(0, '한울', ['A', 'A'], 2)] });
    expect(r.byPlayer['A'][0].games).toBe(1);
  });
});
