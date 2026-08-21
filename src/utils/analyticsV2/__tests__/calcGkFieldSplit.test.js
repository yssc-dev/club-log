import { describe, it, expect } from 'vitest';
import { calcGkFieldSplit } from '../calcGkFieldSplit';

// GK vs 필드 스플릿 — "내가 GK일 때 vs 필드일 때 팀 득점/실점" 비교.
// 매치 단위로 our_gk/opponent_gk가 기록된 사이드만 집계한다(레거시 GK 미기록 매치는
// 필드 출전 여부도 확정 못 하므로 그 사이드 전체 제외).

const M = (over = {}) => ({
  date: '2026-06-04', match_id: 'R1_C1', is_extra: false,
  our_members_json: '[]', opponent_members_json: '[]',
  our_score: 0, opponent_score: 0, our_gk: '', opponent_gk: '',
  ...over,
});

describe('calcGkFieldSplit', () => {
  it('our 사이드: GK와 필드 선수를 나눠 팀 득점/실점을 집계한다', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({ our_members_json: '["A","B","C"]', our_gk: 'A', our_score: 3, opponent_score: 1 }),
    ] });
    expect(perPlayer.A.gk).toEqual({ games: 1, goalsFor: 3, goalsAgainst: 1 });
    expect(perPlayer.A.field).toEqual({ games: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(perPlayer.B.field).toEqual({ games: 1, goalsFor: 3, goalsAgainst: 1 });
    expect(perPlayer.B.gk).toEqual({ games: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(perPlayer.C.field.games).toBe(1);
  });

  it('opponent 사이드도 집계한다 (풋살 로테이션 — 양쪽 다 우리 클럽), 득실은 반대로', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({
        our_members_json: '["A"]', our_gk: 'A',
        opponent_members_json: '["D","E"]', opponent_gk: 'D',
        our_score: 3, opponent_score: 1,
      }),
    ] });
    expect(perPlayer.D.gk).toEqual({ games: 1, goalsFor: 1, goalsAgainst: 3 });
    expect(perPlayer.E.field).toEqual({ games: 1, goalsFor: 1, goalsAgainst: 3 });
  });

  it('GK 미기록 사이드는 통째로 제외한다 (필드 여부를 확정할 수 없음)', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({
        our_members_json: '["A","B"]', our_gk: '',
        opponent_members_json: '["D","E"]', opponent_gk: 'D',
        our_score: 2, opponent_score: 2,
      }),
    ] });
    expect(perPlayer.A).toBeUndefined();
    expect(perPlayer.B).toBeUndefined();
    expect(perPlayer.D.gk.games).toBe(1); // 기록된 사이드는 정상 집계
  });

  it('휴식(absent) 선수는 집계하지 않는다', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({
        our_members_json: '{"players":["A","B","C"],"absent":["C"]}',
        our_gk: 'A', our_score: 1, opponent_score: 0,
      }),
    ] });
    expect(perPlayer.C).toBeUndefined();
    expect(perPlayer.B.field.games).toBe(1);
  });

  it('is_extra 매치는 제외한다', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({ is_extra: true, our_members_json: '["A","B"]', our_gk: 'A', our_score: 5, opponent_score: 0 }),
    ] });
    expect(perPlayer.A).toBeUndefined();
  });

  it('GK가 명단에 빠져 있어도 GK로 집계한다 (gk 필드가 출전의 권위 소스)', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({ our_members_json: '["B"]', our_gk: 'A', our_score: 2, opponent_score: 1 }),
    ] });
    expect(perPlayer.A.gk).toEqual({ games: 1, goalsFor: 2, goalsAgainst: 1 });
  });

  it('여러 매치에 걸쳐 GK/필드 양쪽으로 누적된다', () => {
    const { perPlayer } = calcGkFieldSplit({ matchLogs: [
      M({ our_members_json: '["A","B"]', our_gk: 'A', our_score: 2, opponent_score: 1 }),
      M({ match_id: 'R2_C1', our_members_json: '["A","B"]', our_gk: 'B', our_score: 0, opponent_score: 3 }),
      M({ match_id: 'R3_C1', opponent_members_json: '["A","B"]', opponent_gk: 'A', our_score: 1, opponent_score: 4 }),
    ] });
    expect(perPlayer.A.gk).toEqual({ games: 2, goalsFor: 6, goalsAgainst: 2 });
    expect(perPlayer.A.field).toEqual({ games: 1, goalsFor: 0, goalsAgainst: 3 });
    expect(perPlayer.B.gk).toEqual({ games: 1, goalsFor: 0, goalsAgainst: 3 });
    expect(perPlayer.B.field).toEqual({ games: 2, goalsFor: 6, goalsAgainst: 2 });
  });

  it('빈 입력은 빈 결과', () => {
    expect(calcGkFieldSplit({ matchLogs: [] }).perPlayer).toEqual({});
    expect(calcGkFieldSplit({}).perPlayer).toEqual({});
  });
});
