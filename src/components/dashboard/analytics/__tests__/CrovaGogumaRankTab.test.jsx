import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import CrovaGogumaRankTab from '../CrovaGogumaRankTab';
import { C } from '../../../../config/constants';

// 시트는 고구마를 음수로 저장한다 — 절대값으로 뒤집어 순위를 매긴다
const members = [
  { name: '가', crova: 9, goguma: -1 },
  { name: '나', crova: 5, goguma: -4 },
  { name: '다', crova: 0, goguma: -7 },
];
const render = (props) => renderToStaticMarkup(
  createElement(CrovaGogumaRankTab, { members, C, ...props }),
);

describe('CrovaGogumaRankTab', () => {
  it('크로바·고구마 두 랭킹을 순위 막대로 그린다', () => {
    const html = render({});
    expect(html).toContain('🍀 크로바');
    expect(html).toContain('🍠 고구마');
    expect(html).toContain('1위');
    expect(html).toContain('9점');
    expect(html).not.toContain('NaN');
  });

  it('고구마는 음수를 절대값으로 세워 많은 쪽이 1위', () => {
    const html = render({});
    expect(html).toContain('7점'); // 다(-7)가 고구마 1위
  });

  it('점수가 0인 선수는 목록에서 빠진다', () => {
    // 다의 크로바는 0 → 크로바 목록엔 없고 고구마 목록에만 있다
    const only = render({ members: [{ name: '다', crova: 0, goguma: -7 }] });
    expect(only).toContain('7점');
    expect(only.split('다').length - 1).toBe(1);
  });

  it('명단이 없어도 안전', () => {
    expect(render({ members: [] })).not.toContain('NaN');
    expect(render({ members: null })).not.toContain('NaN');
  });
});
