// 렌더 크래시 방어 + 뷰 전환 + 날짜필터 모드 검증.
// TennisSync는 내부 fetch라 renderToStaticMarkup에서 빈 데이터로 그려짐(크래시만 검증).
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisAnalyticsTab from '../TennisAnalyticsTab';
import { LegacyStandingsSection } from '../tennisStandingsSections';
import { buildLegacyStandings } from '../../../utils/tennis/tennisDateFilter';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getLegacyRecords: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 최소 ds/C 픽스처 — LegacyStandingsSection 직접 렌더용
const mockC = { gray: '#999', white: '#fff', card: '#222', cardLight: '#333', borderColor: '#444', accent: '#07f' };
const mockDs = {
  card: { background: mockC.card, padding: 12, borderRadius: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  th: { padding: '4px 8px', borderBottom: '1px solid #333' },
  td: (bold) => ({ padding: '4px 8px', fontWeight: bold ? 700 : 400 }),
};

describe('TennisAnalyticsTab 스모크', () => {
  it('초기(로딩중)에 크래시 없이 렌더 — SSR은 useEffect 미실행이라 loading 유지', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisAnalyticsTab, { C: undefined, authUserName: '박성언' }))
    );
    expect(html).toContain('데이터 로딩중');
  });

  it('빈/로딩 데이터에서 레거시 배너가 뜨지 않음(row 모드 폴백)', () => {
    // rows=[], legacyRows=[] → years=[] → years.includes('2026')=false → mode='row'
    // 오해 배너("집계 전적만 있습니다") 미표시가 올바른 동작
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisAnalyticsTab, { C: undefined }))
    );
    expect(html).not.toContain('집계 전적만 있습니다');
  });

  it('LegacyStandingsSection — buildLegacyStandings 픽스처로 직접 렌더(이름·집계 표시)', () => {
    const legacyRows = [
      { player: '문형민', season: '2025', format: '복식', wins: 10, losses: 4 },
      { player: '박준태', season: '2025', format: '복식', wins: 7, losses: 6 },
      { player: '홍길동', season: '2025', format: '복식', wins: 3, losses: 8 },
    ];
    const standings = buildLegacyStandings({ legacyRows, year: '2025', format: '복식' });
    const html = renderToStaticMarkup(
      createElement(LegacyStandingsSection, { standings, year: '2025', format: '복식', ds: mockDs, C: mockC })
    );
    expect(html).toContain('2025');
    expect(html).toContain('집계');
    expect(html).toContain('문형민');
    expect(html).toContain('박준태');
    // 승-패 표시
    expect(html).toContain('10-4');
    expect(html).toContain('7-6');
  });

  it('LegacyStandingsSection — 빈 standings에서 "데이터 없음" 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(LegacyStandingsSection, { standings: [], year: '2024', format: '단식', ds: mockDs, C: mockC })
    );
    expect(html).toContain('데이터 없음');
  });
});
