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
  it('초기(로딩중)에 크래시 없이 렌더 — SSR은 useEffect 미실행이라 loading 유지', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisLeague, { C: undefined }))
    );
    // 로딩중엔 옵션 없는 select·오해 안내 대신 "데이터 로딩중" 단일 표시
    expect(html).toContain('데이터 로딩중');
  });
});
