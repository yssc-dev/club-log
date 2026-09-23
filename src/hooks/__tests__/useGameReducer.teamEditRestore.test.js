// src/hooks/__tests__/useGameReducer.teamEditRestore.test.js
// RESTORE_STATE 자가복구: 경기 중 "팀 수정"(ENTER_TEAM_EDIT)으로 phase 가 teamBuild 가 된 상태를
// 다른 기기가 받으면, 그 기기는 teamEditMode(로컬 전용)를 모르므로 팀편성 화면에 착지한다.
// 그 화면의 "경기 시작" 버튼은 schedule·allEvents·completedMatches·confirmedRounds·gks 를 전부 지우므로
// 받는 쪽은 반드시 match 로 되돌아가야 한다.
//
// 판별 근거는 "대진이 있다" 하나로 충분하다 — schedule 은 START_MATCHES 만이 채우고
// START_MATCHES 는 같은 액션에서 phase 를 match 로 바꾼다. 즉 teamBuild + 대진 있음 = 경기 중 편집 잔재.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const SCHED = [{ matches: [[0, 1], [2, 3]] }, { matches: [[0, 2], [1, 3]] }];

describe('RESTORE_STATE 자가복구 — 경기 중 팀 수정 잔재', () => {
  it('첫 라운드 미확정이어도 대진이 있으면 match 로 되돌린다', () => {
    // 확정 라운드도 완료 경기도 없고 currentRoundIdx 도 0 인 구간(첫 라운드 진행 중)
    const after = gameReducer(initialState, {
      type: 'RESTORE_STATE',
      state: {
        phase: 'teamBuild', schedule: SCHED,
        completedMatches: [], confirmedRounds: {}, currentRoundIdx: 0,
      },
    });
    expect(after.phase).toBe('match');
  });

  it('진행 흔적이 있는 경우에도 그대로 match', () => {
    const after = gameReducer(initialState, {
      type: 'RESTORE_STATE',
      state: {
        phase: 'teamBuild', schedule: SCHED,
        completedMatches: [], confirmedRounds: { 0: true }, currentRoundIdx: 1,
      },
    });
    expect(after.phase).toBe('match');
  });

  it('대진이 없는 정상 팀편성 단계는 teamBuild 를 유지한다(정규 세션 회귀 방지)', () => {
    const after = gameReducer(initialState, {
      type: 'RESTORE_STATE',
      state: {
        phase: 'teamBuild', schedule: [],
        completedMatches: [], confirmedRounds: {}, currentRoundIdx: 0,
        teams: [['a'], ['b']], teamNames: ['팀A', '팀B'],
      },
    });
    expect(after.phase).toBe('teamBuild');
  });

  it('schedule 이 이번 payload 에 없으면 기존 state 의 대진으로 판단한다', () => {
    const before = { ...initialState, schedule: SCHED };
    const after = gameReducer(before, {
      type: 'RESTORE_STATE',
      state: { phase: 'teamBuild', completedMatches: [], confirmedRounds: {}, currentRoundIdx: 0 },
    });
    expect(after.phase).toBe('match');
  });

  it('setup·match 등 다른 phase 는 건드리지 않는다', () => {
    const setup = gameReducer(initialState, { type: 'RESTORE_STATE', state: { phase: 'setup', schedule: SCHED } });
    expect(setup.phase).toBe('setup');
    const match = gameReducer(initialState, { type: 'RESTORE_STATE', state: { phase: 'match', schedule: SCHED } });
    expect(match.phase).toBe('match');
  });
});
