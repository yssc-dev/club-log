// src/utils/__tests__/cupSchedule.test.js
// 스펙 §6.3 불변식 5 — 풀리그 1회전: 모든 팀 수에서 각 쌍 정확히 1회, 라운드 안 팀 중복 없음, 라운드당 경기 ≤ 구장 수.
import { describe, it, expect } from 'vitest';
import { generateCupRounds, courtCountFor, buildCupDaySchedule } from '../cup/cupSchedule';

function audit(rounds, N, c) {
  const pairs = new Map();
  for (const r of rounds) {
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.length).toBeLessThanOrEqual(c);
    const seen = new Set();
    for (const [h, a] of r.matches) {
      expect(h).not.toBe(a);
      expect(seen.has(h) || seen.has(a)).toBe(false);
      seen.add(h); seen.add(a);
      const k = [h, a].sort((x, y) => x - y).join('|');
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  }
  expect(pairs.size).toBe(N * (N - 1) / 2);
  for (const v of pairs.values()) expect(v).toBe(1);
}

describe('courtCountFor', () => {
  it('3팀 이하 1구장, 4팀 이상 2구장', () => {
    expect(courtCountFor(3)).toBe(1);
    expect(courtCountFor(4)).toBe(2);
    expect(courtCountFor(8)).toBe(2);
  });
});

describe('generateCupRounds', () => {
  for (const N of [3, 4, 5, 6, 7, 8]) {
    it(`N=${N}: 각 쌍 1회·라운드 내 중복 없음·구장 수 이하`, () => {
      const c = courtCountFor(N);
      audit(generateCupRounds(N, c), N, c);
    });
  }
  it('N=5 는 손수 짠 5라운드 표(각 라운드 2경기)', () => {
    const r = generateCupRounds(5, 2);
    expect(r).toHaveLength(5);
    expect(r.every(x => x.matches.length === 2)).toBe(true);
  });
  it('N=7 은 손수 짠 11라운드 표(연속 휴식 최소)', () => {
    expect(generateCupRounds(7, 2)).toHaveLength(11);
  });
  it('N=4 는 3라운드 × 2경기, N=3(1구장)은 3라운드 × 1경기', () => {
    expect(generateCupRounds(4, 2).map(r => r.matches.length)).toEqual([2, 2, 2]);
    expect(generateCupRounds(3, 1).map(r => r.matches.length)).toEqual([1, 1, 1]);
  });
  it('범위 밖 팀 수는 throw', () => {
    expect(() => generateCupRounds(1, 1)).toThrow('팀은 3~8개여야 합니다');
    expect(() => generateCupRounds(9, 2)).toThrow('팀은 3~8개여야 합니다');
  });
  it('반환 배열은 호출마다 새 객체(호출부가 변형해도 표가 안 바뀜)', () => {
    const a = generateCupRounds(5, 2); a[0].matches.push([9, 9]);
    expect(generateCupRounds(5, 2)[0].matches).toHaveLength(2);
  });
});

describe('buildCupDaySchedule (스펙 §6.3 v2.1)', () => {
  it('rotations=1 은 generateCupRounds 와 같은 라운드(새 객체)', () => {
    const base = generateCupRounds(4, 2);
    const day = buildCupDaySchedule(4, 2, 1);
    expect(day).toEqual(base);
    expect(day).not.toBe(base);
    expect(day[0]).not.toBe(base[0]);
    expect(day[0].matches[0]).not.toBe(base[0].matches[0]);
  });
  it('rotations=3 은 canonical 을 3번 이어붙인다(순서·홈/원정 그대로)', () => {
    const base = generateCupRounds(3, 1);
    const day = buildCupDaySchedule(3, 1, 3);
    expect(day).toHaveLength(base.length * 3);
    expect(day.slice(0, 3)).toEqual(base);
    expect(day.slice(3, 6)).toEqual(base);
    expect(day.slice(6, 9)).toEqual(base);
  });
  it('rotations 는 1~3 으로 클램프, 비숫자는 1', () => {
    expect(buildCupDaySchedule(3, 1, 0)).toHaveLength(3);
    expect(buildCupDaySchedule(3, 1, 9)).toHaveLength(9);
    expect(buildCupDaySchedule(3, 1, 'x')).toHaveLength(3);
    expect(buildCupDaySchedule(3, 1, undefined)).toHaveLength(3);
  });
  it('M=2 는 1구장 1경기 라운드 하나', () => {
    expect(courtCountFor(2)).toBe(1);
    expect(generateCupRounds(2, 1)).toEqual([{ matches: [[0, 1]] }]);
    expect(buildCupDaySchedule(2, 1, 2)).toEqual([{ matches: [[0, 1]] }, { matches: [[0, 1]] }]);
  });
  it('M=5·2구장·2회전 = 10라운드, 각 쌍 정확히 2회', () => {
    const day = buildCupDaySchedule(5, 2, 2);
    expect(day).toHaveLength(10);
    const count = {};
    for (const r of day) for (const [h, a] of r.matches) { const k = [h, a].sort().join('-'); count[k] = (count[k] || 0) + 1; }
    expect(Object.keys(count)).toHaveLength(10);
    expect(Object.values(count).every(v => v === 2)).toBe(true);
  });
});
