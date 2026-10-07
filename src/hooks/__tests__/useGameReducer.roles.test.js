// SET_SOCCER_MATCH_ROLES 격리 계약.
// 논리 matchIdx 매칭(배열 index 불변식에 의존하지 않음) + 타 경기·events·status·점수 무변경.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const match = (idx, extra = {}) => ({
  matchIdx: idx, opponent: `상대${idx}`, lineup: ['A', 'B'], gk: 'A', defenders: ['B'],
  subs: [], formation: '4-4-2', assignments: { 0: 'A' }, positionMap: { A: 'GK' },
  events: [{ id: `e${idx}`, type: 'goal', player: 'B', timestamp: 100 }],
  startedAt: 1000 + idx, ourScore: 1, opponentScore: 0, status: 'finished', ...extra,
});

const withMatches = (matches) => ({ ...initialState, soccerMatches: matches });

const ROLES = { camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] };

describe('gameReducer — SET_SOCCER_MATCH_ROLES', () => {
  it('해당 경기의 roles 를 설정한다', () => {
    const next = gameReducer(withMatches([match(0), match(1)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 1, roles: ROLES,
    });
    expect(next.soccerMatches[1].roles).toEqual(ROLES);
  });

  it('다른 경기는 건드리지 않는다', () => {
    const s = withMatches([match(0), match(1)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 1, roles: ROLES });
    expect(next.soccerMatches[0]).toEqual(s.soccerMatches[0]);
    expect(next.soccerMatches[0].roles).toBeUndefined();
  });

  it('events·status·점수·배치는 보존된다', () => {
    const s = withMatches([match(0)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: ROLES });
    const m = next.soccerMatches[0];
    expect(m.events).toEqual(s.soccerMatches[0].events);
    expect(m.status).toBe('finished');
    expect(m.ourScore).toBe(1);
    expect(m.assignments).toEqual({ 0: 'A' });
    expect(m.opponent).toBe('상대0');
  });

  it('배열 순서가 matchIdx 와 달라도 논리 matchIdx 로 찾는다', () => {
    // 배열 index 1 에 논리 matchIdx 0 이 있는 뒤집힌 상태
    const next = gameReducer(withMatches([match(1), match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: ROLES,
    });
    expect(next.soccerMatches[1].roles).toEqual(ROLES);
    expect(next.soccerMatches[0].roles).toBeUndefined();
  });

  it('없는 matchIdx 면 아무것도 바뀌지 않는다', () => {
    const s = withMatches([match(0)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 9, roles: ROLES });
    expect(next.soccerMatches).toEqual(s.soccerMatches);
  });

  it('roles 를 정규화해 저장한다 — 부심 3명은 2명으로, falsy 원소는 제거', () => {
    const next = gameReducer(withMatches([match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0,
      roles: { camera: ['김A', ''], referee: '박C', assistants: ['a', 'b', 'c'] },
    });
    expect(next.soccerMatches[0].roles)
      .toEqual({ camera: ['김A'], referee: '박C', assistants: ['a', 'b'] });
  });

  it('roles 누락/null 이면 전원 공석으로 저장한다 (undefined 저장 금지)', () => {
    const next = gameReducer(withMatches([match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: null,
    });
    expect(next.soccerMatches[0].roles).toEqual({ camera: [], referee: '', assistants: [] });
  });
});
