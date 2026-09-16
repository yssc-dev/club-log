// 스펙 §16.3.3 — 배치 중(setup) 단계 순수 로직.
import { describe, it, expect } from 'vitest';
import {
  sideMeta, sideReady, sideStarters, bothReady, overlapStarters,
  setupPool, externalPool, canReady, canStartSetup,
} from '../setup';

const TEAMS = [
  { name: '흰팀', players: ['a1', 'a2', 'a3', 'a9'] },   // a9 = 결석(참석자에 없음)
  { name: '검은팀', players: ['b1', 'b2', 'b3'] },
];
const ATTENDEES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'f1'];  // f1 = 유동 인원(팀 열에 없음)

// 11명 배치 헬퍼 — assignments 는 { 슬롯번호: 이름 }
const eleven = (prefix) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, `${prefix}${i}`]));

const setupMatch = (over = {}) => ({
  matchIdx: 0, status: 'setup', startedAt: null,
  sideA: { name: '흰팀' }, sideB: { name: '검은팀' },
  assignments: null, events: [], ...over,
});

describe('sideMeta / sideReady / sideStarters', () => {
  it('sideMeta 는 편 객체를, 없으면 빈 객체를 준다', () => {
    const m = setupMatch();
    expect(sideMeta(m, 'A')).toEqual({ name: '흰팀' });
    expect(sideMeta(m, 'B')).toEqual({ name: '검은팀' });
    expect(sideMeta({}, 'A')).toEqual({});
  });
  it('sideReady 는 ready === true 일 때만 참이다', () => {
    expect(sideReady(setupMatch({ sideA: { name: '흰팀', ready: true } }), 'A')).toBe(true);
    expect(sideReady(setupMatch({ sideA: { name: '흰팀', ready: 'yes' } }), 'A')).toBe(false);
    expect(sideReady(setupMatch(), 'A')).toBe(false);
  });
  it('sideStarters 는 A=최상위 assignments, B=sideB.assignments 를 읽고 없으면 빈 배열이다', () => {
    const m = setupMatch({ assignments: { 0: 'a1', 1: 'a2' }, sideB: { name: '검은팀', assignments: { 0: 'b1' } } });
    expect(sideStarters(m, 'A')).toEqual(['a1', 'a2']);
    expect(sideStarters(m, 'B')).toEqual(['b1']);
    expect(sideStarters(setupMatch(), 'A')).toEqual([]);
    expect(sideStarters(setupMatch(), 'B')).toEqual([]);
  });
});

describe('overlapStarters / bothReady', () => {
  it('정렬·중복제거를 실제로 한다(슬롯 순서 ≠ 이름 순서, 한 편에 같은 이름 중복)', () => {
    const m = setupMatch({
      assignments: { 0: 'f2', 1: 'f1', 2: 'f1' },                    // 슬롯 순서로는 f2 가 먼저이고 f1 이 두 번
      sideB: { name: '검은팀', assignments: { 0: 'f1', 1: 'f2' } },
    });
    // 정렬을 빼면 ['f2','f1','f1'], uniq 를 빼면 ['f1','f1','f2'] 가 된다 — 둘 다 이 단정에서 실패한다.
    expect(overlapStarters(m)).toEqual(['f1', 'f2']);
    expect(overlapStarters(setupMatch())).toEqual([]);
  });
  it('bothReady 는 양쪽 ready 가 참일 때만 참이다', () => {
    expect(bothReady(setupMatch({ sideA: { ready: true }, sideB: { ready: true } }))).toBe(true);
    expect(bothReady(setupMatch({ sideA: { ready: true }, sideB: { ready: false } }))).toBe(false);
  });
});

describe('setupPool / externalPool', () => {
  it('자체전 풀 = (팀 명단 ∪ 유동 인원) ∩ 참석자 − 제외 목록', () => {
    expect(setupPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES, excludeNames: [] }))
      .toEqual(['a1', 'a2', 'a3', 'f1']);                       // a9 는 결석이라 빠진다
    expect(setupPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES, excludeNames: ['f1'] }))
      .toEqual(['a1', 'a2', 'a3']);                             // 상대가 이미 쓴 유동 인원 제외
  });
  it('외부전 풀 = 팀 명단 ∩ 참석자 (유동 인원 제외 — 유저 결정)', () => {
    expect(externalPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES })).toEqual(['a1', 'a2', 'a3']);
    expect(externalPool({ teams: TEAMS, teamName: '없는팀', attendees: ATTENDEES })).toEqual([]);
  });
});

describe('canReady / canStartSetup', () => {
  const full = () => setupMatch({
    assignments: eleven('a'), sideB: { name: '검은팀', assignments: eleven('b') },
  });
  it('선발이 11명이 아니면 사유와 함께 막는다', () => {
    const r = canReady(setupMatch({ assignments: { 0: 'a1' } }), 'A');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('11명');
    expect(r.reason).toContain('1명');
  });
  it('11명이어도 양 팀에 같은 선수가 있으면 막고 이름을 알려준다', () => {
    const m = setupMatch({ assignments: { ...eleven('a'), 0: 'b0' }, sideB: { name: '검은팀', assignments: eleven('b') } });
    const r = canReady(m, 'A');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('b0');
  });
  it('11명·중복 없음이면 준비 가능', () => {
    expect(canReady(full(), 'A')).toEqual({ ok: true, reason: '' });
  });
  it('canStartSetup 은 양쪽 11명·양쪽 ready·중복 0 일 때만 ok', () => {
    expect(canStartSetup(full()).ok).toBe(false);                        // ready 없음
    expect(canStartSetup(full()).reason).toContain('준비');
    const ready = setupMatch({
      assignments: eleven('a'), sideA: { name: '흰팀', ready: true },
      sideB: { name: '검은팀', ready: true, assignments: eleven('b') },
    });
    expect(canStartSetup(ready)).toEqual({ ok: true, reason: '' });
  });
});
