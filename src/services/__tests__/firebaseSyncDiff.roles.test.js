// 역할의 실시간 공유 계약.
// ① roles 변경이 soccerMatches/{idx}/roles 경로 하나로만 쓰인다(타 경기·이벤트 무영향)
// ② RTDB 가 빈 배열을 드롭한 모양을 되읽어도 reconstructState 가 배열로 복원한다
//    → 이게 없으면 받는 기기가 roles.camera.map 에서 터진다.
import { describe, it, expect } from 'vitest';
import { diffStateToWrites, reconstructState } from '../firebaseSyncDiff';
import { gameReducer, initialState } from '../../hooks/useGameReducer';

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

  it('리듀서가 저장한 로컬 state 와 RTDB 왕복 복원 state 가 같다 — 에코 쓰기 루프 없음', () => {
    // ★ 이 테스트가 지키는 것: 받는 기기에서 '복원된 원격 state'가 그대로 다음 diff 의 기준선이
    //   된다(useFirebaseSync.js). 그래서 리듀서가 저장한 모양과 복원된 모양이 한 글자라도 다르면
    //   매 동기화 틱마다 soccerMatches/{idx}/roles 를 다시 쓰는 무한 루프가 된다.
    //   약한 버전 두 개를 쓰지 말 것:
    //     - diffStateToWrites(st, st)  : deepEqual 의 a===b 빠른 경로에 걸려 항상 통과
    //     - 독립 복원 2개 비교          : '결정성'만 증명 — 순수 함수면 자동으로 참
    const local = gameReducer(
      { ...initialState, soccerMatches: [{
        matchIdx: 0, opponent: '한울', status: 'finished', startedAt: 1000,
        lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [], formation: '4-4-2',
        assignments: { 0: 'A' }, positionMap: { A: 'GK' },
        events: [{ id: 'e0', type: 'goal', player: 'B', timestamp: 100 }],
        ourScore: 1, opponentScore: 0,
      }] },
      { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: { camera: [], referee: '박C', assistants: [] } }
    );

    // Firebase 가 실제로 하는 일: 빈 배열/빈 객체를 저장하지 않는다. 그 손실을 그대로 재현한다.
    const dropEmpties = (o) => {
      if (Array.isArray(o)) return o.length === 0 ? undefined : o.map(dropEmpties);
      if (o && typeof o === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(o)) {
          const d = dropEmpties(v);
          if (d !== undefined) out[k] = d;
        }
        return Object.keys(out).length === 0 ? undefined : out;
      }
      return o;
    };
    const m = local.soccerMatches[0];
    const node = dropEmpties({
      meta: { gameId: 'g_1' },
      soccerMatches: { 0: { ...m, events: { e0: m.events[0] } } },
    });
    expect(node.soccerMatches[0].roles).toEqual({ referee: '박C' }); // 빈 배열이 사라진 것 확인

    const remote = reconstructState('g_1', node);
    expect(remote.soccerMatches[0].roles).toEqual(m.roles);

    const writes = diffStateToWrites(remote, local);
    expect(Object.keys(writes).filter(k => k.startsWith('soccerMatches'))).toEqual([]);
  });
});
