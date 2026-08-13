import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisLeague from '../TennisLeague';

vi.mock('../../../services/tennisSync', () => ({
  default: {
    getPlayerGames: () => Promise.resolve([]),
    getLegacyRecords: () => Promise.resolve([]),
    getRoster: () => Promise.resolve([]),
  },
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

describe('TennisLeague 스모크', () => {
  it('빈 데이터에서 크래시 없이 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisLeague, { C: undefined }))
    );
    // 빈 데이터(연도 없음) → "데이터 없음" 안내
    expect(html).toContain('데이터 없음');
  });
});
