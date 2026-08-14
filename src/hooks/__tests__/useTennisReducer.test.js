import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState, findCourt } from '../useTennisReducer';

const A = (type, payload = {}) => ({ type, ...payload });
const C = { roundIdx: 1, courtId: 1 };

// 라운드1/코트1이 있고, 참석자가 배정된 진행 중 상태를 만든다.
function playingState({ format = '단식', bestOf = 1, sideA = ['성언'], sideB = ['철우'] } = {}) {
  let s = tennisReducer(tennisInitialState, A('SET_ATTENDEES', { attendees: ['성언', '철우', '다빈', '원희'] }));
  s = tennisReducer(s, A('ADD_ROUND'));
  s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format }));
  s = tennisReducer(s, A('SET_COURT_BEST_OF', { ...C, bestOf }));
  for (const n of [...sideA, ...sideB]) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
  return tennisReducer(s, A('START_COURT', C));
}
const games = (s) => { const c = findCourt(s, 1, 1); return [c.sets[c.currentSet].a, c.sets[c.currentSet].b]; };

describe('라운드와 코트', () => {
  it('라운드를 추가하면 코트 1개가 함께 생기고 기본값은 단식·1세트', () => {
    const s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0].courts).toHaveLength(1);
    expect(s.rounds[0].courts[0]).toMatchObject({ format: '단식', bestOf: 1, status: 'ready' });
  });

  it('코트를 상한 없이 추가할 수 있다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    for (let i = 0; i < 4; i++) s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    expect(s.rounds[0].courts).toHaveLength(5);
    expect(s.rounds[0].courts.map(c => c.courtId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('코트 삭제는 ready 상태에서만 먹힌다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    s = tennisReducer(s, A('DELETE_COURT', { roundIdx: 1, courtId: 2 }));
    expect(s.rounds[0].courts).toHaveLength(1);

    const playing = playingState();
    const after = tennisReducer(playing, A('DELETE_COURT', C));
    expect(findCourt(after, 1, 1)).not.toBeNull();
  });
});

describe('선수 배치', () => {
  it('단식이면 좌우 1칸씩만 열린다 — 세 번째 탭은 무시', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    for (const n of ['성언', '철우', '다빈']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언']);
    expect(c.sideB).toEqual(['철우']);
  });

  it('복식이면 왼쪽 2칸을 채우고 오른쪽으로 넘어간다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    for (const n of ['성언', '다빈', '원희', '민환']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언', '다빈']);
    expect(c.sideB).toEqual(['원희', '민환']);
  });

  it('복식 → 단식으로 줄이면 넘치는 인원이 빠진다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    for (const n of ['성언', '다빈', '원희', '민환']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '단식' }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언']);
    expect(c.sideB).toEqual(['원희']);
  });

  it('같은 선수를 두 번 담을 수 없다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '성언' }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '성언' }));
    expect(findCourt(s, 1, 1).sideB).toEqual([]);
  });

  it('좌우 교체', () => {
    let s = playingState();
    s = tennisReducer(s, A('EDIT_COURT_SETTINGS', C));
    s = tennisReducer(s, A('SWAP_SIDES', C));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['철우']);
    expect(c.sideB).toEqual(['성언']);
  });

  it('선수를 배정한 뒤 제거하면 슬롯이 비워진다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '성언' }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '철우' }));
    s = tennisReducer(s, A('REMOVE_PLAYER', { ...C, name: '성언' }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual([]);
    expect(c.sideB).toEqual(['철우']);
  });

  it('경기 시작 후 REMOVE_PLAYER는 무시된다', () => {
    let s = playingState();
    s = tennisReducer(s, A('REMOVE_PLAYER', { ...C, name: '성언' }));
    expect(findCourt(s, 1, 1).sideA).toEqual(['성언']);
  });

  it('경기 도중 선수 추가가 가능하다', () => {
    let s = playingState();
    s = tennisReducer(s, A('ADD_ATTENDEE', { name: '지각생', isGuest: false }));
    expect(s.attendees).toContain('지각생');
    s = tennisReducer(s, A('ADD_ATTENDEE', { name: '민환', isGuest: true }));
    expect(s.guests).toContain('민환');
  });
});

describe('게임 증분과 타이브레이크', () => {
  it('▲로 게임이 오른다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    expect(games(s)).toEqual([1, 0]);
  });

  it('5:5가 되면 게임 증분이 막히고 타이브레이크 포인트로 넘어간다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    expect(games(s)).toEqual([5, 5]);

    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    expect(games(s)).toEqual([5, 5]);   // 게임 증분은 무시

    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(1);
  });

  it('노에드7 타이브레이크 7점이면 7:5로 세트가 확정된다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    for (let i = 0; i < 7; i++) s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0]).toMatchObject({ a: 7, b: 5, tbA: 7 });
  });

  it('타이브레이크가 아닐 때 포인트 증분은 무시된다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(0);
  });
});

describe('에이스/더블폴트 — 선수 단위', () => {
  it('복식에서 같은 편 두 선수가 따로 쌓인다', () => {
    let s = playingState({ format: '복식', sideA: ['성언', '다빈'], sideB: ['원희', '민환'] });
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '다빈', stat: 'df' }));
    const st = findCourt(s, 1, 1).stats;
    expect(st['성언']).toMatchObject({ aces: 2, df: 0 });
    expect(st['다빈']).toMatchObject({ aces: 0, df: 1 });
  });
});

describe('세트/판 종료와 되돌리기', () => {
  it('세트 종료로 1세트 경기가 끝나면 status가 done', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    expect(findCourt(s, 1, 1).status).toBe('done');
  });

  it('★ 판을 끝낸 세트 종료를 되돌리면 status도 playing으로 함께 풀린다', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    expect(findCourt(s, 1, 1).status).toBe('done');

    s = tennisReducer(s, A('UNDO', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('playing');       // done에 갇히면 빠져나갈 길이 없다
    expect(c.sets[0].done).toBe(false);
    expect(c.currentSet).toBe(0);
  });

  it('3세트 경기는 세트 종료 후 다음 세트가 열린다', () => {
    let s = playingState({ bestOf: 3 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('playing');
    expect(c.sets).toHaveLength(2);
    expect(c.currentSet).toBe(1);
  });

  it('되돌리기는 게임 증분을 하나씩 연속으로 취소한다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    expect(games(s)).toEqual([2, 1]);
    s = tennisReducer(s, A('UNDO', C));
    expect(games(s)).toEqual([2, 0]);
    s = tennisReducer(s, A('UNDO', C));
    expect(games(s)).toEqual([1, 0]);
  });

  it('되돌리기는 타이브레이크 포인트도 취소한다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(0);
  });

  it('타이브레이크 7점째 되돌리기는 게임도 7→5로 함께 돌린다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    for (let i = 0; i < 7; i++) s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    // 노에드7 7점 직후: a=7, tbA=7
    expect(findCourt(s, 1, 1).sets[0]).toMatchObject({ a: 7, tbA: 7 });
    s = tennisReducer(s, A('UNDO', C));
    // 되돌리면 7점이 취소되고, 7점으로 승격됐던 게임도 함께 5로 내려야 한다
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(6);
    expect(findCourt(s, 1, 1).sets[0].a).toBe(5);
  });

  it('되돌리기는 에이스/DF도 취소한다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 1).stats['성언']?.aces || 0).toBe(0);
  });

  it('스택이 비면 되돌리기는 아무 일도 하지 않는다', () => {
    const s = playingState();
    expect(tennisReducer(s, A('UNDO', C))).toEqual(s);
  });

  it('되돌리기는 다른 코트를 건드리지 않는다', () => {
    let s = playingState();
    s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { roundIdx: 1, courtId: 2, name: '다빈' }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { roundIdx: 1, courtId: 2, name: '원희' }));
    s = tennisReducer(s, A('START_COURT', { roundIdx: 1, courtId: 2 }));
    s = tennisReducer(s, A('INCREMENT_GAME', { roundIdx: 1, courtId: 2, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));

    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 2).sets[0].a).toBe(1);   // 코트2는 그대로
    expect(findCourt(s, 1, 1).sets[0].a).toBe(0);
  });
});

describe('설정 잠금과 복구', () => {
  it('시작 후에는 단복식/세트수 변경이 먹히지 않는다', () => {
    let s = playingState({ bestOf: 1 });
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    s = tennisReducer(s, A('SET_COURT_BEST_OF', { ...C, bestOf: 3 }));
    expect(findCourt(s, 1, 1)).toMatchObject({ format: '단식', bestOf: 1 });
  });

  it('EDIT_COURT_SETTINGS는 점수를 지우고 ready로 되돌린다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('EDIT_COURT_SETTINGS', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('ready');
    expect(c.sets).toEqual([]);
    expect(c.undoStack).toEqual([]);
    expect(c.stats).toEqual({});
    expect(c.sideA).toEqual(['성언']);   // 배치는 유지 — 화면에서 고치게 한다
  });

  it('1→3세트는 점수를 유지한 채 늘린다', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 3; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('EXTEND_TO_THREE_SETS', C));
    const c = findCourt(s, 1, 1);
    expect(c.bestOf).toBe(3);
    expect(c.status).toBe('playing');
    expect(c.sets[0].a).toBe(3);
  });
});

describe('INIT_STATE', () => {
  it('RTDB에서 온 반쪽 상태를 정규화해 받는다', () => {
    const s = tennisReducer(tennisInitialState, A('INIT_STATE', {
      state: { gameId: 'g_1', rounds: { 0: { roundIdx: 1, courts: { 0: { courtId: 1 } } } } },
    }));
    expect(s.rounds[0].courts[0].sets).toEqual([]);
    expect(s.attendees).toEqual([]);
  });
});
