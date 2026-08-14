// 케미 탭 하위 뷰 렌더 스모크 — 순위 막대 전환(2026-08-14) 경로 커버.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import GkChemistryView from '../GkChemistryView';
import AssistPairList from '../AssistPairList';
import { C } from '../../../../config/constants';

const render = (comp, props) => renderToStaticMarkup(createElement(comp, { C, ...props }));

describe('GkChemistryView', () => {
  const chem = {
    gks: ['키퍼A'],
    byGk: {
      키퍼A: {
        pairs: [
          { field: '가', cleanRate: 0.8, cleanSheets: 8, rounds: 10 },
          { field: '나', cleanRate: 0.5, cleanSheets: 5, rounds: 10 },
        ],
        // WORST는 나쁜 순 정렬 — 첫 행이 최댓값이 아니다
        worst: [
          { field: '다', cleanRate: 0.1, cleanSheets: 1, rounds: 10 },
          { field: '라', cleanRate: 0.4, cleanSheets: 4, rounds: 10 },
        ],
      },
    },
  };

  it('BEST/WORST를 순위 막대로 그린다', () => {
    const html = render(GkChemistryView, { chem });
    expect(html).toContain('80%');
    expect(html).toContain('8/10');
    expect(html).not.toContain('NaN');
  });

  it('WORST 목록은 실제 최댓값 기준이라 막대가 다 차지 않는다', () => {
    const html = render(GkChemistryView, { chem });
    expect(html).toContain('width:25%'); // 0.1 / 0.4
  });

  it('WORST에는 순위 번호를 붙이지 않는다 — 하위 목록이라 오독된다', () => {
    const html = render(GkChemistryView, { chem });
    // '1위'는 BEST 1행에서만 나온다. WORST에도 붙으면 2번 나온다.
    expect(html.split('1위').length - 1).toBe(1);
    expect(html.split('2위').length - 1).toBe(1);
  });

  it('GK가 없으면 안내문', () => {
    expect(render(GkChemistryView, { chem: { gks: [] } })).toContain('GK 케미 데이터 없음');
  });
});

describe('AssistPairList', () => {
  const pairs = [
    { assister: '가', scorer: '나', count: 6, sharedGames: 12, perSharedGame: 0.5 },
    { assister: '다', scorer: '라', count: 3, sharedGames: 10, perSharedGame: 0.3 },
  ];

  it('어시 방향을 유지한 채 순위 막대로 그린다', () => {
    const html = render(AssistPairList, { pairs });
    expect(html).toContain('가 → 나');
    expect(html).toContain('6회');
    expect(html).toContain('0.50/R');
    expect(html).not.toContain('NaN');
  });

  it('sharedGames가 없으면 빈도 표기를 생략한다', () => {
    const html = render(AssistPairList, { pairs: [{ assister: '가', scorer: '나', count: 4 }] });
    expect(html).toContain('4회');
    expect(html).not.toContain('/R');
  });

  it('페어가 없으면 안내문', () => {
    expect(render(AssistPairList, { pairs: [] })).toContain('어시 페어 데이터 없음');
  });
});
