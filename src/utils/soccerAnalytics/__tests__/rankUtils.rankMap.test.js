import { describe, it, expect } from 'vitest';
import { rankMap } from '../rankUtils';

const rows = [
  { name: '가', v: 3 },
  { name: '나', v: 1 },
  { name: '다', v: 2 },
];

describe('rankMap', () => {
  it('기본은 큰 값이 1위', () => {
    const m = rankMap(rows, r => r.v);
    expect([m.get('가'), m.get('다'), m.get('나')]).toEqual([1, 2, 3]);
  });

  it('lowerIsBetter면 작은 값이 1위 — 실점률처럼 낮을수록 좋은 축', () => {
    const m = rankMap(rows, r => r.v, { lowerIsBetter: true });
    expect([m.get('나'), m.get('다'), m.get('가')]).toEqual([1, 2, 3]);
  });

  it('동점은 공동 순위, 다음 순위는 건너뛴다', () => {
    const m = rankMap([
      { name: '가', v: 5 }, { name: '나', v: 5 }, { name: '다', v: 1 },
    ], r => r.v);
    expect(m.get('가')).toBe(1);
    expect(m.get('나')).toBe(1);
    expect(m.get('다')).toBe(3);
  });

  it('player 키도 이름으로 인정한다 (기존 buildRankedTop과 같은 규약)', () => {
    const m = rankMap([{ player: '가', v: 1 }], r => r.v);
    expect(m.get('가')).toBe(1);
  });

  it('빈 입력은 빈 맵', () => {
    expect(rankMap([], r => r.v).size).toBe(0);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...rows];
    rankMap(input, r => r.v);
    expect(input.map(r => r.name)).toEqual(['가', '나', '다']);
  });
});
