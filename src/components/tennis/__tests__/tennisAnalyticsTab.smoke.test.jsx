// 렌더 크래시 방어 + 뷰 전환. TennisSync는 내부 fetch라 renderToStaticMarkup에서 빈 데이터로 그려짐(크래시만 검증).
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisAnalyticsTab from '../TennisAnalyticsTab';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getLegacyRecords: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

describe('TennisAnalyticsTab 스모크', () => {
  it('빈 데이터·기본(전체) 상태에서 크래시 없이 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisAnalyticsTab, { C: undefined, authUserName: '박성언' }))
    );
    expect(html).toContain('전체 랭킹'); // select 빈 옵션 라벨
  });
});
