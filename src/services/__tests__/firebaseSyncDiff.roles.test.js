// 역할의 실시간 공유 계약.
// ① roles 변경이 soccerMatches/{idx}/roles 경로 하나로만 쓰인다(타 경기·이벤트 무영향)
// ② RTDB 가 빈 배열을 드롭한 모양을 되읽어도 reconstructState 가 배열로 복원한다
//    → 이게 없으면 받는 기기가 roles.camera.map 에서 터진다.
import { describe, it, expect } from 'vitest';
import { diffStateToWrites, reconstructState } from '../firebaseSyncDiff';

const match = (idx, extra = {}) => ({
  matchIdx: idx, opponent: `상대${idx}`, lineup: ['A', 'B'], gk: 'A', defenders: ['B'],
  subs: [], formation: '4-4-2', assignments: { 0: 'A' }, positionMap: { A: 'GK' },
  events: [{ id: `e${idx}`, type: 'goal', player: 'B', timestamp: 100 }],
  startedAt: 1000 + idx, ourScore: 1, opponentScore: 0, status: 'finished', ...extra,
});

const ROLES = { camera: ['김A'], referee: '박C', assistants: ['최D'] };

describe('diffStateToWrites — roles 전파', () => {
  it('roles 만 바뀌면 soccerMatches/{idx}/roles 한 경로만 쓴다', () => {
    const prev = { soccerMatches: [match(0), match(1)] };
    const next = { soccerMatches: [match(0), { ...match(1), roles: ROLES }] };
    const writes = diffStateToWrites(prev, next);
    expect(Object.keys(writes)).toEqual(['soccerMatches/1/roles']);
    expect(writes['soccerMatches/1/roles']).toEqual(ROLES);
  });

  it('roles 를 전원 공석으로 비우는 변경도 그 경로 하나로 쓴다', () => {
    const prev = { soccerMatches: [{ ...match(0), roles: ROLES }] };
    const empty = { camera: [], referee: '', assistants: [] };
    const next = { soccerMatches: [{ ...match(0), roles: empty }] };
    const writes = diffStateToWrites(prev, next);
    expect(Object.keys(writes)).toEqual(['soccerMatches/0/roles']);
    expect(writes['soccerMatches/0/roles']).toEqual(empty);
  });

  it('roles 가 같으면 쓰기가 없다 (에코 루프 방지)', () => {
    const prev = { soccerMatches: [{ ...match(0), roles: ROLES }] };
    const next = { soccerMatches: [{ ...match(0), roles: { ...ROLES } }] };
    expect(diffStateToWrites(prev, next)).toEqual({});
  });
});

describe('reconstructState — RTDB 빈배열 드롭 복원', () => {
  const raw = (roles) => ({
    meta: { gameId: 'g_1' },
    soccerMatches: {
      0: {
        matchIdx: 0, opponent: '상대0', status: 'finished', startedAt: 1000,
        events: { e0: { id: 'e0', type: 'goal', player: 'B', timestamp: 100 } },
        ...(roles === undefined ? {} : { roles }),
      },
    },
  });

  it('camera/assistants 가 드롭돼 {referee} 만 와도 배열로 복원한다', () => {
    const st = reconstructState('g_1', raw({ referee: '박C' }));
    expect(st.soccerMatches[0].roles)
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });

  it('roles 노드가 아예 없어도 정규형을 채운다', () => {
    const st = reconstructState('g_1', raw(undefined));
    expect(st.soccerMatches[0].roles)
      .toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('배열이 객체화({0:..})돼 와도 배열로 복원한다', () => {
    const st = reconstructState('g_1', raw({ camera: { 0: '김A', 1: '이B' }, referee: '' }));
    expect(st.soccerMatches[0].roles.camera).toEqual(['김A', '이B']);
  });

  it('복원 결과는 재전송을 유발하지 않는다 — 같은 state 를 diff 하면 쓰기 0', () => {
    const st = reconstructState('g_1', raw({ referee: '박C' }));
    expect(diffStateToWrites(st, st)).toEqual({});
  });
});
