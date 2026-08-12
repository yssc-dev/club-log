import { describe, it, expect } from 'vitest';
import { buildRankedTop } from '../rankUtils';

describe('buildRankedTop', () => {
  it('동점자는 공동 순위, 다음 순위는 건너뜀 (1,1,3)', () => {
    const rows = [
      { player: 'A', value: 5 },
      { player: 'B', value: 5 },
      { player: 'C', value: 3 },
    ];
    const r = buildRankedTop(rows, { limit: 5 });
    expect(r.map(x => x.rank)).toEqual([1, 1, 3]);
  });

  it('공동 순위가 limit 경계에 걸리면 잘리지 않고 모두 포함 (rank <= limit)', () => {
    const rows = [
      { player: 'A', value: 9 },
      { player: 'B', value: 5 },
      { player: 'C', value: 5 },
      { player: 'D', value: 5 },
      { player: 'E', value: 1 },
    ];
    const r = buildRankedTop(rows, { limit: 2 });
    // rank: A=1, B=C=D=2 → rank<=2 전원 포함, E(rank 5) 제외
    expect(r.map(x => x.player)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('정렬은 value 내림차순, 동률 내 이름 가나다순', () => {
    const rows = [
      { player: '나', value: 2 },
      { player: '가', value: 2 },
      { player: '다', value: 7 },
    ];
    const r = buildRankedTop(rows, { limit: 5 });
    expect(r.map(x => x.player)).toEqual(['다', '가', '나']);
  });
});
