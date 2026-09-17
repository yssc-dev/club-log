// src/utils/__tests__/cupSchedule.test.js
// 스펙 §6.3 불변식 5 — 풀리그 1회전: 모든 팀 수에서 각 쌍 정확히 1회, 라운드 안 팀 중복 없음, 라운드당 경기 ≤ 구장 수.
import { describe, it, expect } from 'vitest';
import { generateCupRounds, courtCountFor } from '../cup/cupSchedule';

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
    expect(() => generateCupRounds(2, 1)).toThrow('팀은 3~8개여야 합니다');
    expect(() => generateCupRounds(9, 2)).toThrow('팀은 3~8개여야 합니다');
  });
  it('반환 배열은 호출마다 새 객체(호출부가 변형해도 표가 안 바뀜)', () => {
    const a = generateCupRounds(5, 2); a[0].matches.push([9, 9]);
    expect(generateCupRounds(5, 2)[0].matches).toHaveLength(2);
  });
});
