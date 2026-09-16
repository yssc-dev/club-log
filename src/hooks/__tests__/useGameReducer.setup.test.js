// 스펙 §16.3.2 — 배치 중(setup) 경기용 리듀서. 하버FC 가 쓰는 기존 동작은 그대로여야 한다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const create = (state, extra = {}) => gameReducer(state, {
  type: 'CREATE_SOCCER_MATCH', opponent: '검은팀', lineup: [], gk: '', defenders: [],
  subs: [], formation: null, assignments: null, positionMap: null, ...extra,
});
const fresh = () => ({ ...initialState, soccerMatches: [] });

describe('CREATE_SOCCER_MATCH — 선택 인자', () => {
  it('인자를 안 넘기면 기존과 동일(playing · startedAt 기록)', () => {
    const m = create(fresh()).soccerMatches[0];
    expect(m.status).toBe('playing');
    expect(typeof m.startedAt).toBe('number');
  });
  it('status/startedAt 을 넘기면 그대로 저장한다', () => {
    const m = create(fresh(), { status: 'setup', startedAt: null }).soccerMatches[0];
    expect(m.status).toBe('setup');
    expect(m.startedAt).toBe(null);
    expect(m.matchIdx).toBe(0);
  });
});

describe('PATCH_SOCCER_SETUP', () => {
  const setup = () => create(fresh(), { status: 'setup', startedAt: null });
  it('A: 배치 키는 최상위에, 이름·준비는 sideA 에 넣는다', () => {
    const s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: {
      name: '흰팀', ready: true, readyBy: '홍길동',
      lineup: ['a1'], gk: 'a1', defenders: [], formation: '4-4-2',
      assignments: { 0: 'a1' }, positionMap: { a1: 'GK' }, subs: ['a2'],
      status: 'HACK', events: ['nope'],
    } });
    const m = s.soccerMatches[0];
    expect(m.sideA).toEqual({ name: '흰팀', ready: true, readyBy: '홍길동' });
    expect(m.lineup).toEqual(['a1']);
    expect(m.assignments).toEqual({ 0: 'a1' });
    expect(m.status).toBe('setup');          // 화이트리스트 밖 키는 무시
    expect(m.events).toEqual([]);
  });
  it('B: 배치 키·이름·준비를 모두 sideB 에 병합한다', () => {
    let s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'B', patch: { name: '검은팀', lineup: ['b1'] } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'B', patch: { ready: true } });
    expect(s.soccerMatches[0].sideB).toEqual({ name: '검은팀', lineup: ['b1'], ready: true });
    expect(s.soccerMatches[0].lineup).toEqual([]);   // A 최상위는 건드리지 않는다
  });
  it('setup 이 아닌 경기에는 아무 일도 하지 않는다', () => {
    const playing = create(fresh());
    const s = gameReducer(playing, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: true } });
    expect(s.soccerMatches[0].sideA).toBeUndefined();
  });
  it('ready:false / readyBy:null 도 반영한다(배치 저장 시 준비 해제)', () => {
    let s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: true, readyBy: '홍길동' } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: false, readyBy: null } });
    expect(s.soccerMatches[0].sideA.ready).toBe(false);
    expect(s.soccerMatches[0].sideA.readyBy).toBe(null);
  });
});

describe('START_SOCCER_MATCH', () => {
  it('setup → playing 으로 바꾸고 startedAt·currentMatchIdx 를 세운다', () => {
    const s = gameReducer(create(fresh(), { status: 'setup', startedAt: null }), { type: 'START_SOCCER_MATCH', matchIdx: 0, startedAt: 1234 });
    expect(s.soccerMatches[0].status).toBe('playing');
    expect(s.soccerMatches[0].startedAt).toBe(1234);
    expect(s.currentMatchIdx).toBe(0);
  });
  it('이미 playing 이면 state 를 그대로 돌려준다(멱등 — 두 기기가 동시에 보내도 안전)', () => {
    const playing = create(fresh());
    const s = gameReducer(playing, { type: 'START_SOCCER_MATCH', matchIdx: 0, startedAt: 9999 });
    expect(s).toBe(playing);
  });
});

describe('DELETE_SOCCER_SETUP_MATCH', () => {
  it('마지막 setup 경기를 지우고 currentMatchIdx 를 보정한다', () => {
    let s = create(fresh());                                   // 0: playing
    s = create(s, { status: 'setup', startedAt: null });        // 1: setup
    const out = gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 1 });
    expect(out.soccerMatches).toHaveLength(1);
    expect(out.currentMatchIdx).toBe(0);
  });
  it('마지막이 아니거나 setup 이 아니면 아무 일도 하지 않는다', () => {
    let s = create(fresh(), { status: 'setup', startedAt: null });  // 0: setup
    s = create(s);                                                  // 1: playing
    expect(gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 0 })).toBe(s);  // 중간 경기
    expect(gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 1 })).toBe(s);  // playing
  });
});
