import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — 매치별 휴식 (absentees)', () => {
  it('TOGGLE_ABSENT로 추가/제거 토글', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: '김성태' });
    expect(s.absentees['R1_C0'][0]).toEqual(['김성태']);
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: '김성태' });
    expect(s.absentees['R1_C0']).toBeUndefined();
  });

  it('같은 매치의 다른 팀에 독립적 휴식', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: 'A' });
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 1, player: 'X' });
    expect(s.absentees['R1_C0']).toEqual({ 0: ['A'], 1: ['X'] });
  });

  it('CONFIRM_ROUND 시 absentees가 completedMatches.homeAbsent/awayAbsent로 박제되고 라이브에서 제거', () => {
    const teams = [['A','B','C','D','E','F'], ['G','H','I','J','K'], [], []];
    const s = withState({
      teams,
      teamNames: ['팀1', '팀2', '팀3', '팀4'],
      currentRoundIdx: 0,
      schedule: [[{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2' }]],
      absentees: { 'R1_C0': { 0: ['F'], 1: [] } },
    });
    const matchResults = [{
      matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2',
      homeScore: 2, awayScore: 1, homeGk: 'A', awayGk: 'G',
    }];
    const next = gameReducer(s, { type: 'CONFIRM_ROUND', roundIdx: 0, matchResults });
    expect(next.completedMatches[0].homeAbsent).toEqual(['F']);
    expect(next.completedMatches[0].awayAbsent).toEqual([]);
    expect(next.absentees['R1_C0']).toBeUndefined();
  });

  it('용병을 다른 팀으로 옮기면 이전 팀의 휴식 기록이 따라 정리된다', () => {
    // 2026-08-13 마스터FC R1_C1 재현:
    // 이영문을 팀동규(2) 용병으로 넣고 휴식 표시 → 제거 → 팀관수(3) 용병으로 재등록.
    // 정리가 없으면 absentees[R1_C1][2]에 이영문이 남아 GK/골 입력이 막힘(화면엔 휴식 표시 없음).
    let s = withState({});
    s = gameReducer(s, { type: 'ADD_LIVE_MERC', matchId: 'R1_C1', teamIdx: 2, player: '이영문' });
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C1', teamIdx: 2, player: '이영문' });
    expect(s.absentees['R1_C1'][2]).toEqual(['이영문']);

    s = gameReducer(s, { type: 'REMOVE_LIVE_MERC', matchId: 'R1_C1', player: '이영문' });
    expect(s.absentees['R1_C1']).toBeUndefined();

    s = gameReducer(s, { type: 'ADD_LIVE_MERC', matchId: 'R1_C1', teamIdx: 3, player: '이영문' });
    expect(s.absentees['R1_C1']).toBeUndefined();
  });

  it('제거 없이 다른 매치로 차출돼도 이전 매치의 휴식 기록이 정리된다', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'ADD_LIVE_MERC', matchId: 'R1_C0', teamIdx: 0, player: '이영문' });
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C0', teamIdx: 0, player: '이영문' });
    s = gameReducer(s, { type: 'ADD_LIVE_MERC', matchId: 'R1_C1', teamIdx: 3, player: '이영문' });
    expect(s.liveMercs['R1_C0']).toBeUndefined();
    expect(s.absentees['R1_C0']).toBeUndefined();
  });

  it('다른 팀 선수의 휴식 기록은 건드리지 않는다', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'TOGGLE_ABSENT', matchId: 'R1_C1', teamIdx: 2, player: '남인진' });
    s = gameReducer(s, { type: 'ADD_LIVE_MERC', matchId: 'R1_C1', teamIdx: 3, player: '이영문' });
    s = gameReducer(s, { type: 'REMOVE_LIVE_MERC', matchId: 'R1_C1', player: '이영문' });
    expect(s.absentees['R1_C1'][2]).toEqual(['남인진']);
  });

  it('CONFIRM_ROUND 스냅샷에 팀 명단 밖 유령 휴식은 포함되지 않는다', () => {
    const teams = [['A','B','C'], ['G','H','I'], [], []];
    const s = withState({
      teams,
      teamNames: ['팀1', '팀2', '팀3', '팀4'],
      currentRoundIdx: 0,
      schedule: [[{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2' }]],
      // 'G'는 팀2 소속인데 팀1(0) 휴식 명단에 잘못 박혀 있는 상태
      absentees: { 'R1_C0': { 0: ['B', 'G'], 1: ['I'] } },
    });
    const matchResults = [{
      matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2',
      homeScore: 2, awayScore: 1, homeGk: 'A', awayGk: 'G',
    }];
    const next = gameReducer(s, { type: 'CONFIRM_ROUND', roundIdx: 0, matchResults });
    expect(next.completedMatches[0].homeAbsent).toEqual(['B']);
    expect(next.completedMatches[0].awayAbsent).toEqual(['I']);
  });

  it('UNCONFIRM_ROUND 시 박제됐던 absentees가 라이브로 복원', () => {
    const teams = [['A','B'], ['C','D'], [], []];
    const s = withState({
      teams,
      teamNames: ['팀1', '팀2', '팀3', '팀4'],
      confirmedRounds: { 0: true },
      currentRoundIdx: 1,
      schedule: [[], []],
      completedMatches: [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: '팀1', awayTeam: '팀2',
        homeScore: 1, awayScore: 0,
        homePlayers: ['A','B'], awayPlayers: ['C','D'],
        homeAbsent: ['B'], awayAbsent: ['D'],
      }],
    });
    const next = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.absentees['R1_C0']).toEqual({ 0: ['B'], 1: ['D'] });
  });
});
