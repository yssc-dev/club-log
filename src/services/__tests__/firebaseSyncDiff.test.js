import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  eventsToObj,
  matchesToObj,
  soccerMatchesToObj,
  diffStateToWrites,
  reconstructState,
  expandStateForRtdb,
} from '../firebaseSyncDiff';

describe('deepEqual', () => {
  it('primitive 동등', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
  it('객체/배열 깊은 비교', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
  it('배열 vs 객체 구분', () => {
    expect(deepEqual([], {})).toBe(false);
  });
});

describe('eventsToObj/matchesToObj/soccerMatchesToObj', () => {
  it('events 는 id 키로 변환, id 없는 항목은 스킵', () => {
    const arr = [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }, { x: 3 }, null];
    expect(eventsToObj(arr)).toEqual({ e1: { id: 'e1', x: 1 }, e2: { id: 'e2', x: 2 } });
  });
  it('matches 는 matchId 키로', () => {
    const arr = [{ matchId: 'R1_C0' }, { matchId: 'R1_C1' }, {}];
    expect(matchesToObj(arr)).toEqual({
      R1_C0: { matchId: 'R1_C0' },
      R1_C1: { matchId: 'R1_C1' },
    });
  });
  it('soccerMatches 는 matchIdx 키로 (string화)', () => {
    const arr = [{ matchIdx: 0, x: 'a' }, { matchIdx: 1, x: 'b' }];
    expect(soccerMatchesToObj(arr)).toEqual({
      '0': { matchIdx: 0, x: 'a' },
      '1': { matchIdx: 1, x: 'b' },
    });
  });
  it('null/undefined 입력은 빈 객체', () => {
    expect(eventsToObj(null)).toEqual({});
    expect(eventsToObj(undefined)).toEqual({});
    expect(matchesToObj(null)).toEqual({});
    expect(soccerMatchesToObj(null)).toEqual({});
  });
});

describe('diffStateToWrites', () => {
  it('변경 없으면 빈 객체', () => {
    const s = { phase: 'ROUND', currentRoundIdx: 0 };
    expect(diffStateToWrites(s, s)).toEqual({});
  });

  it('meta 단일 필드 변경', () => {
    const prev = { phase: 'ROUND', currentRoundIdx: 0 };
    const next = { phase: 'ROUND', currentRoundIdx: 1 };
    expect(diffStateToWrites(prev, next)).toEqual({ 'meta/currentRoundIdx': 1 });
  });

  it('undefined 값은 null 로 변환 (RTDB 삭제)', () => {
    const prev = { phase: 'ROUND' };
    const next = {};
    expect(diffStateToWrites(prev, next)).toEqual({ 'meta/phase': null });
  });

  it('통째로 교체 필드 (teams)', () => {
    const prev = { teams: [['A'], ['B']] };
    const next = { teams: [['A'], ['B', 'C']] };
    expect(diffStateToWrites(prev, next)).toEqual({ teams: [['A'], ['B', 'C']] });
  });

  it('이벤트 추가는 events/{id} 단일 path', () => {
    const prev = { allEvents: [{ id: 'e1', x: 1 }] };
    const next = { allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'events/e2': { id: 'e2', x: 2 },
    });
  });

  it('이벤트 삭제는 events/{id} = null', () => {
    const prev = { allEvents: [{ id: 'e1' }, { id: 'e2' }] };
    const next = { allEvents: [{ id: 'e1' }] };
    expect(diffStateToWrites(prev, next)).toEqual({ 'events/e2': null });
  });

  it('이벤트 수정은 events/{id} 통째 교체', () => {
    const prev = { allEvents: [{ id: 'e1', x: 1 }] };
    const next = { allEvents: [{ id: 'e1', x: 999 }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'events/e1': { id: 'e1', x: 999 },
    });
  });

  it('completedMatches 변경은 matches/{matchId} 단일 path', () => {
    const prev = { completedMatches: [{ matchId: 'R1_C0', score: [3, 2] }] };
    const next = { completedMatches: [{ matchId: 'R1_C0', score: [4, 2] }] };
    expect(diffStateToWrites(prev, next)).toEqual({
      'matches/R1_C0': { matchId: 'R1_C0', score: [4, 2] },
    });
  });

  it('gks 단일 키 변경 → gks/{teamIdx}', () => {
    const prev = { gks: { 0: '이동규', 1: '오희종' } };
    const next = { gks: { 0: '김형근', 1: '오희종' } };
    expect(diffStateToWrites(prev, next)).toEqual({ 'gks/0': '김형근' });
  });

  it('gksHistory round 단위 diff', () => {
    const prev = { gksHistory: { 0: { 0: 'A', 1: 'B' } } };
    const next = { gksHistory: { 0: { 0: 'A', 1: 'B' }, 1: { 0: 'C', 1: 'D' } } };
    expect(diffStateToWrites(prev, next)).toEqual({
      'gksHistory/1': { 0: 'C', 1: 'D' },
    });
  });

  it('confirmedRounds 토글', () => {
    const prev = { confirmedRounds: { 0: true } };
    const next = { confirmedRounds: { 0: true, 1: true } };
    expect(diffStateToWrites(prev, next)).toEqual({ 'confirmedRounds/1': true });
  });

  it('soccerMatches matchIdx 별 path', () => {
    const prev = { soccerMatches: [{ matchIdx: 0, score: [1, 0] }] };
    const next = {
      soccerMatches: [
        { matchIdx: 0, score: [1, 0] },
        { matchIdx: 1, score: [2, 1] },
      ],
    };
    expect(diffStateToWrites(prev, next)).toEqual({
      'soccerMatches/1': { matchIdx: 1, score: [2, 1] },
    });
  });

  it('여러 필드 동시 변경 — 각각 path 분리', () => {
    const prev = {
      phase: 'ROUND',
      currentRoundIdx: 0,
      gks: { 0: 'A' },
      allEvents: [{ id: 'e1', x: 1 }],
    };
    const next = {
      phase: 'ROUND',
      currentRoundIdx: 1,
      gks: { 0: 'B' },
      allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }],
    };
    expect(diffStateToWrites(prev, next)).toEqual({
      'meta/currentRoundIdx': 1,
      'gks/0': 'B',
      'events/e2': { id: 'e2', x: 2 },
    });
  });

  it('prev null 이어도 안전 (초기 저장)', () => {
    const next = { phase: 'INIT', currentRoundIdx: 0, gks: { 0: 'A' } };
    const writes = diffStateToWrites(null, next);
    expect(writes['meta/phase']).toBe('INIT');
    expect(writes['meta/currentRoundIdx']).toBe(0);
    expect(writes['gks/0']).toBe('A');
  });
});

describe('reconstructState', () => {
  it('null raw → null', () => {
    expect(reconstructState('g_1', null)).toBeNull();
  });

  it('빈 raw → 기본값으로 채워진 state', () => {
    const s = reconstructState('g_1', {});
    expect(s.gameId).toBe('g_1');
    expect(s.phase).toBe('');
    expect(s.currentRoundIdx).toBe(0);
    expect(s.teamCount).toBe(4);
    expect(s.matchMode).toBe('schedule');
    expect(s.allEvents).toEqual([]);
    expect(s.completedMatches).toEqual([]);
    expect(s.soccerMatches).toEqual([]);
    expect(s.gks).toEqual({});
  });

  it('events 는 timestamp 오름차순 정렬', () => {
    const raw = {
      events: {
        e2: { id: 'e2', timestamp: 200 },
        e1: { id: 'e1', timestamp: 100 },
        e3: { id: 'e3', timestamp: 300 },
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.allEvents.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('soccerMatches 는 matchIdx 오름차순 정렬', () => {
    const raw = {
      soccerMatches: {
        '2': { matchIdx: 2 },
        '0': { matchIdx: 0 },
        '1': { matchIdx: 1 },
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.soccerMatches.map((m) => m.matchIdx)).toEqual([0, 1, 2]);
  });

  it('meta 값 매핑', () => {
    const raw = {
      meta: {
        phase: 'ROUND',
        currentRoundIdx: 3,
        gameCreator: '동근',
        teamCount: 6,
        gameFinalized: true,
      },
    };
    const s = reconstructState('g_1', raw);
    expect(s.phase).toBe('ROUND');
    expect(s.currentRoundIdx).toBe(3);
    expect(s.gameCreator).toBe('동근');
    expect(s.teamCount).toBe(6);
    expect(s.gameFinalized).toBe(true);
  });

  it('teams 가 RTDB 객체 표기(희소 배열)로 와도 teamCount 길이 배열로 복원', () => {
    const raw = {
      meta: { teamCount: 6 },
      // RTDB 는 빈 배열을 저장 안 하므로 [['김성환'], [], [], [], [], []] → { 0: ['김성환'] } 로 변환됨
      teams: { 0: ['김성환'] },
    };
    const s = reconstructState('g_1', raw);
    expect(s.teams).toEqual([['김성환'], [], [], [], [], []]);
    expect(s.teams.length).toBe(6);
  });

  it('teams 가 아예 없어도 teamCount 길이의 빈 배열로 복원', () => {
    const s = reconstructState('g_1', { meta: { teamCount: 4 } });
    expect(s.teams).toEqual([[], [], [], []]);
  });

  it('draftMode 복원 (없으면 snake)', () => {
    expect(reconstructState('g_1', { meta: { draftMode: 'free' } }).draftMode).toBe('free');
    expect(reconstructState('g_1', { meta: { draftMode: 'sheet' } }).draftMode).toBe('sheet');
    expect(reconstructState('g_1', {}).draftMode).toBe('snake');
  });

  // 회귀 가드: confirmedRounds 는 풋살/축구/테니스 공유 필드.
  // 라운드 확정을 전부 취소하면 diffStateToWrites가 confirmedRounds/{k}=null 을 써서
  // Firebase가 노드를 통째로 삭제 → 다음 snapshot의 raw.confirmedRounds === undefined.
  // reconstructState가 undefined 를 그대로 반환하면 풋살 RESTORE_STATE의
  // `if (s.confirmedRounds != null)` 가드(undefined != null === false)가 스킵돼
  // 구독 중인 다른 탭의 stale 확정 상태가 지워지지 않는다(취소 미전파 회귀).
  it('confirmedRounds 노드가 삭제(undefined)돼도 {} 로 복원해 취소가 전파된다', () => {
    expect(reconstructState('g_1', {}).confirmedRounds).toEqual({});
    expect(reconstructState('g_1', { meta: {} }).confirmedRounds).toEqual({});
  });

  it('confirmedRounds 값이 있으면 그대로 복원', () => {
    const s = reconstructState('g_1', { confirmedRounds: { 0: true, 1: true } });
    expect(s.confirmedRounds).toEqual({ 0: true, 1: true });
  });
});

describe('expandStateForRtdb / 라운드트립', () => {
  it('expand → reconstruct 라운드트립 (값 보존)', () => {
    const original = {
      phase: 'ROUND',
      currentRoundIdx: 2,
      teamCount: 4,
      gameCreator: '동근',
      teams: [['김형근'], ['이동규']],
      teamNames: ['A팀', 'B팀'],
      gks: { 0: '김형근', 1: '이동규' },
      gksHistory: { 0: { 0: '김형근', 1: '이동규' } },
      allEvents: [
        { id: 'e1', timestamp: 100, x: 'a' },
        { id: 'e2', timestamp: 200, x: 'b' },
      ],
      completedMatches: [{ matchId: 'R1_C0', score: [3, 2] }],
      soccerMatches: [{ matchIdx: 0, score: [1, 0] }],
      confirmedRounds: { 0: true },
    };
    const raw = expandStateForRtdb(original);
    const restored = reconstructState('g_1', raw);
    expect(restored.phase).toBe(original.phase);
    expect(restored.currentRoundIdx).toBe(original.currentRoundIdx);
    expect(restored.teamCount).toBe(original.teamCount);
    expect(restored.gameCreator).toBe(original.gameCreator);
    // teams는 teamCount 길이로 패딩됨
    expect(restored.teams).toEqual([['김형근'], ['이동규'], [], []]);
    expect(restored.teamNames).toEqual(['A팀', 'B팀', '팀3', '팀4']);
    expect(restored.gks).toEqual(original.gks);
    expect(restored.gksHistory).toEqual(original.gksHistory);
    expect(restored.allEvents).toEqual(original.allEvents);
    expect(restored.completedMatches).toEqual(original.completedMatches);
    // 경기 객체는 reconstruct 시 정규화됨(RTDB가 누락한 빈 배열/객체 필드를 기본값으로 복원)
    expect(restored.soccerMatches).toEqual([
      { matchIdx: 0, score: [1, 0], events: [], lineup: [], defenders: [], subs: [], assignments: null, positionMap: null, formation: null },
    ]);
    expect(restored.confirmedRounds).toEqual(original.confirmedRounds);
  });

  it('빈 state 도 round-trip 안전', () => {
    const raw = expandStateForRtdb({});
    const restored = reconstructState('g_1', raw);
    expect(restored).not.toBeNull();
    expect(restored.allEvents).toEqual([]);
    expect(restored.completedMatches).toEqual([]);
  });

  it('events/matches 는 키 기반 객체로 펼쳐짐', () => {
    const raw = expandStateForRtdb({
      allEvents: [{ id: 'e1', x: 1 }, { id: 'e2', x: 2 }],
      completedMatches: [{ matchId: 'R1_C0' }],
    });
    expect(raw.events).toEqual({ e1: { id: 'e1', x: 1 }, e2: { id: 'e2', x: 2 } });
    expect(raw.matches).toEqual({ R1_C0: { matchId: 'R1_C0' } });
  });
});

// 축구 이벤트는 matchIdx 노드 통째 교체가 아니라 자식 단위로 diff 해야
// 두 탭이 같은 경기에 동시에 기록해도 서로의 이벤트를 덮어쓰지 않음 (풋살 events/{id}와 동일 원칙).
describe('diffStateToWrites — soccerMatches 자식 노드 단위 diff', () => {
  const ev = (id, type, extra = {}) => ({ id, type, timestamp: Number(id.slice(1)), ...extra });

  it('이벤트 추가 시 매치 통째가 아니라 이벤트 경로만 쓴다', () => {
    const e1 = ev('e1', 'goal', { player: 'A' });
    const e2 = ev('e2', 'yellowCard', { player: 'B' });
    const base = { matchIdx: 0, opponent: '상대FC', status: 'playing', events: [e1] };
    const writes = diffStateToWrites(
      { soccerMatches: [base] },
      { soccerMatches: [{ ...base, events: [e1, e2] }] },
    );
    expect(writes).toEqual({ 'soccerMatches/0/events/e2': e2 });
  });

  it('이벤트 삭제 시 해당 이벤트 경로에 null', () => {
    const e1 = ev('e1', 'goal', { player: 'A' });
    const e2 = ev('e2', 'yellowCard', { player: 'B' });
    const base = { matchIdx: 0, opponent: '상대FC', status: 'playing', events: [e1, e2] };
    const writes = diffStateToWrites(
      { soccerMatches: [base] },
      { soccerMatches: [{ ...base, events: [e1] }] },
    );
    expect(writes).toEqual({ 'soccerMatches/0/events/e2': null });
  });

  it('이벤트 외 필드 변경은 해당 필드 경로만 쓴다', () => {
    const base = { matchIdx: 0, opponent: '상대FC', status: 'playing', events: [] };
    const writes = diffStateToWrites(
      { soccerMatches: [base] },
      { soccerMatches: [{ ...base, status: 'finished', ourScore: 2 }] },
    );
    expect(writes).toEqual({
      'soccerMatches/0/status': 'finished',
      'soccerMatches/0/ourScore': 2,
    });
  });

  it('신규 매치는 통째로 쓰되 events 를 id 키 객체로 직렬화', () => {
    const e1 = ev('e1', 'goal', { player: 'A' });
    const writes = diffStateToWrites(
      { soccerMatches: [] },
      { soccerMatches: [{ matchIdx: 0, opponent: 'X', events: [e1] }] },
    );
    expect(writes).toEqual({
      'soccerMatches/0': { matchIdx: 0, opponent: 'X', events: { e1 } },
    });
  });

  it('빈 events 배열에서 첫 이벤트 추가도 이벤트 경로만 쓴다 (공허 참 경로)', () => {
    const e1 = ev('e1', 'goal', { player: 'A' });
    const base = { matchIdx: 0, opponent: '상대FC', status: 'playing', events: [] };
    const writes = diffStateToWrites(
      { soccerMatches: [base] },
      { soccerMatches: [{ ...base, events: [e1] }] },
    );
    expect(writes).toEqual({ 'soccerMatches/0/events/e1': e1 });
  });

  it('id 없는 이벤트가 섞여 있으면 매치 통째 교체로 폴백 (레거시 데이터 안전)', () => {
    const legacy = { type: 'goal', timestamp: 1 };
    const e9 = ev('e9', 'goal', { player: 'A' });
    const base = { matchIdx: 0, events: [legacy] };
    const next = { ...base, events: [legacy, e9] };
    const writes = diffStateToWrites({ soccerMatches: [base] }, { soccerMatches: [next] });
    expect(writes).toEqual({ 'soccerMatches/0': next });
  });

  it('매치 제거는 노드 null', () => {
    const writes = diffStateToWrites(
      { soccerMatches: [{ matchIdx: 0, events: [] }] },
      { soccerMatches: [] },
    );
    expect(writes).toEqual({ 'soccerMatches/0': null });
  });

  it('expandStateForRtdb → reconstructState 라운드트립에서 events 를 정렬된 배열로 복원', () => {
    const e1 = ev('e1', 'goal', { player: 'A' });
    const e2 = ev('e2', 'goal', { player: 'B' });
    const raw = expandStateForRtdb({
      soccerMatches: [{ matchIdx: 0, opponent: 'X', events: [e2, e1] }],
    });
    expect(raw.soccerMatches['0'].events).toEqual({ e1, e2 });
    const restored = reconstructState('g_1', raw);
    expect(restored.soccerMatches[0].events).toEqual([e1, e2]);
  });
});
