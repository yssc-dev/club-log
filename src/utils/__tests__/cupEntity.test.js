// src/utils/__tests__/cupEntity.test.js
// 스펙 §3·§4.2·§4.5 — 대회 엔티티 정규화·검증·잠금·식별자(순수 로직).
import { describe, it, expect } from 'vitest';
import { normalizeCup, validateTeams, nextTeamId, isLocked, cupIdOf, normalizeTeamName, cleanPlayerName } from '../cup/cupEntity';

const META = { id: '마스터스컵 2026', name: '마스터스컵 2026', sport: '풋살', format: 'league1', status: 'active', createdAt: 100, createdBy: '홍길동', updatedAt: 100 };

describe('normalizeCup', () => {
  it('teams 객체를 order 순 배열로, players 누락은 [], captain 누락은 "", lockedAt 누락은 null', () => {
    const cup = normalizeCup('마스터스컵 2026', {
      meta: META,
      teams: {
        t2: { id: 't2', name: '팀B', order: 1, players: ['b1'] },
        t1: { id: 't1', name: '팀A', order: 0 },               // players·captain 없음(RTDB 빈배열 누락)
      },
    });
    expect(cup.teams.map(t => t.id)).toEqual(['t1', 't2']);
    expect(cup.teams[0].players).toEqual([]);
    expect(cup.teams[0].captain).toBe('');
    expect(cup.meta.lockedAt).toBeNull();
    expect(cup.meta.status).toBe('active');
  });
  it('players 가 RTDB 객체({0:"a",1:"b"})로 와도 배열로', () => {
    const cup = normalizeCup('c', { meta: META, teams: { t1: { name: '팀A', order: 0, players: { 0: 'a', 1: 'b' } } } });
    expect(cup.teams[0].players).toEqual(['a', 'b']);
    expect(cup.teams[0].id).toBe('t1'); // 키로 보강
  });
  it('raw 없음·meta 없음·풋살 아님은 null (축구 대회 모드의 cache/activeGame 노드 제외)', () => {
    expect(normalizeCup('x', null)).toBeNull();
    expect(normalizeCup('x', { cache: {}, activeGame: {} })).toBeNull();
    expect(normalizeCup('x', { meta: { ...META, sport: '축구' } })).toBeNull();
  });
});

describe('validateTeams', () => {
  const T = (id, name, players, extra = {}) => ({ id, name, players, captain: '', order: 0, ...extra });
  const three = () => [T('t1', '팀A', ['a1']), T('t2', '팀B', ['b1']), T('t3', '팀C', ['c1'])];
  it('정상 3팀 → ok, 이름 정규화(앞 "팀 " 공백·★ 장식) 반영', () => {
    const r = validateTeams([T('t1', '팀 A', ['a1 ★']), T('t2', '팀B', ['b1']), T('t3', '팀C', ['c1'])]);
    expect(r.ok).toBe(true);
    expect(r.teams[0].name).toBe('팀A');
    expect(r.teams[0].players).toEqual(['a1']);
  });
  it('팀 수 3~8', () => {
    expect(validateTeams(three().slice(0, 2)).errors).toContain('팀은 3~8개여야 합니다');
    expect(validateTeams(Array.from({ length: 9 }, (_, i) => T(`t${i + 1}`, `팀${i + 1}`, [`p${i}`]))).errors).toContain('팀은 3~8개여야 합니다');
  });
  it('팀명 빈 값·중복·| 금지', () => {
    expect(validateTeams([T('t1', '', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명이 비어 있습니다');
    expect(validateTeams([T('t1', '팀A', ['a']), T('t2', '팀A', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명 중복: 팀A');
    expect(validateTeams([T('t1', '팀|A', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명에 | 는 쓸 수 없습니다: 팀|A');
  });
  it('각 팀 최소 1명, 한 선수는 한 팀에만', () => {
    expect(validateTeams([T('t1', '팀A', []), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀A: 팀원이 없습니다');
    expect(validateTeams([T('t1', '팀A', ['x']), T('t2', '팀B', ['x']), T('t3', '팀C', ['c'])]).errors).toContain('x: 두 팀에 있습니다(팀A, 팀B)');
  });
  it('captain 은 "" 이거나 그 팀 players 에 포함', () => {
    expect(validateTeams([T('t1', '팀A', ['a'], { captain: 'zz' }), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀A: 팀장 zz 이(가) 팀원에 없습니다');
    expect(validateTeams([T('t1', '팀A', ['a'], { captain: 'a' }), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).ok).toBe(true);
  });
  it('id 없는 팀은 에러', () => {
    expect(validateTeams([T(undefined, '팀A', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀 id 가 없습니다: 팀A');
  });
});

describe('nextTeamId', () => {
  it('최대 번호+1, 삭제된 번호는 재사용하지 않는다', () => {
    expect(nextTeamId([])).toBe('t1');
    expect(nextTeamId([{ id: 't1' }, { id: 't3' }])).toBe('t4'); // t2 삭제됐어도 t4
    expect(nextTeamId([{ id: 'x' }])).toBe('t1');               // 규칙 밖 id 는 무시
  });
});

describe('isLocked', () => {
  it('lockedAt 만으로도, 로그(playedPairs)만으로도 잠김', () => {
    expect(isLocked({ meta: { lockedAt: 123 } })).toBe(true);
    expect(isLocked({ meta: { lockedAt: null } }, new Set(['팀A|팀B']))).toBe(true);
    expect(isLocked({ meta: { lockedAt: null } }, new Set())).toBe(false);
    expect(isLocked(null)).toBe(false);
  });
});

describe('cupIdOf / normalizeTeamName / cleanPlayerName', () => {
  it('safeKey 위임: RTDB 금지문자 → _, trim', () => {
    expect(cupIdOf('  마스터스컵 2026 ')).toBe('마스터스컵 2026');
    expect(cupIdOf('a.b#c$d/e[f]')).toBe('a_b_c_d_e_f_');
  });
  it('빈 값·| 는 throw', () => {
    expect(() => cupIdOf('   ')).toThrow('대회명을 입력하세요');
    expect(() => cupIdOf('a|b')).toThrow('대회명에 | 는 쓸 수 없습니다');
  });
  it('팀명·선수명 정규화', () => {
    expect(normalizeTeamName(' 팀 승훈 ')).toBe('팀승훈');
    expect(cleanPlayerName(' 홍길동 ★ ')).toBe('홍길동');
  });
});
