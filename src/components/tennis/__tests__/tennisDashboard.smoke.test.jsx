import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import TennisDashboard from '../TennisDashboard';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

function Harness() { const { C } = useTheme(); return createElement(TennisDashboard, { C }); }

describe('TennisDashboard 스모크', () => {
  it('빈 데이터에서 크래시 없이 렌더, 섹션 타이틀 존재', () => {
    const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Harness)));
    expect(html).toContain('복식 순위 TOP 5');
    expect(html).toContain('단식 순위 TOP 5');
    expect(html).toContain('하이라이트');
  });
});
