// 순위 섹션 렌더 크래시 방어(픽스처). 리그 탭의 로우연도 경로가 쓰는 Doubles/Singles 섹션을
// 실데이터로 직접 렌더한다 — renderToStaticMarkup(SSR)은 useEffect 미실행이라 TennisLeague의
// 데이터 로드 경로를 커버할 수 없으므로(대시보드 스모크와 동일 한계), 섹션을 직접 검증한다.
// LegacyStandingsSection은 tennisAnalyticsTab.smoke에서 별도 커버.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import { SinglesStandingsSection, DoublesStandingsSection } from '../tennisStandingsSections';

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 실 ds/C는 makeStyles로 (섹션이 SortHeader·ds.td() 등 전체 필드를 요구)
function Harness({ Comp, props }) {
  const { C } = useTheme();
  const ds = makeStyles(C);
  return createElement(Comp, { ...props, ds, C });
}
const render = (Comp, props) =>
  renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Harness, { Comp, props })));

const SINGLES = [
  { name: '박준태', grade: '금배', leagueTier: '챌린저리그', wins: 5, losses: 1, rate: 5 / 6, points: 12 },
  { name: '문형민', grade: '은배', leagueTier: '투어리그', wins: 2, losses: 4, rate: 1 / 3, points: 3 },
];
const DOUBLES = [
  { name: '박준태', grade: '금배', wins: 8, losses: 2, rate: 0.8 },
  { name: '문형민', grade: '은배', wins: 4, losses: 6, rate: 0.4 },
];

describe('tennisStandingsSections 스모크', () => {
  it('SinglesStandingsSection — 포인트 픽스처 렌더(길로틴·투어/챌린저·P·크래시 없음)', () => {
    const html = render(SinglesStandingsSection, { standings: SINGLES, periodLabel: '2026년' });
    expect(html).toContain('길로틴리그');
    expect(html).toContain('2026년');
    expect(html).toContain('박준태');
    expect(html).toContain('문형민');
    expect(html).toContain('챌린저');   // 챌린저리그 약칭
    expect(html).toContain('투어');     // 투어리그 약칭
    expect(html).toContain('12');   // points
  });

  it('SinglesStandingsSection — 빈 standings는 null(제목 미출력)', () => {
    const html = render(SinglesStandingsSection, { standings: [], periodLabel: '2026년' });
    expect(html).not.toContain('길로틴리그');
  });

  it('DoublesStandingsSection — 픽스처 렌더(투몽·크래시 없음)', () => {
    const html = render(DoublesStandingsSection, { standings: DOUBLES, periodLabel: '2026년' });
    expect(html).toContain('투몽');
    expect(html).toContain('박준태');
    expect(html).toContain('문형민');
  });
});
