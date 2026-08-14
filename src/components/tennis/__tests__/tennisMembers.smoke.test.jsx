// TennisMembers 렌더 크래시 방어(SSR). useEffect 미실행이라 로딩 상태로 그려짐.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisMembers from '../TennisMembers';

vi.mock('../../../services/tennisSync', () => ({
  default: {
    getRosterAdmin: () => Promise.resolve([]),
    writeRosterMember: () => Promise.resolve({ success: true }),
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

describe('TennisMembers 스모크', () => {
  it('초기(로딩중) 크래시 없이 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisMembers, { C: undefined }))
    );
    expect(html).toContain('데이터 로딩중');
  });
});
