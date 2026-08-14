// HBarChart·PlayerRadarChart 렌더 크래시 방어. renderToStaticMarkup(SSR)으로
// 픽스처 데이터 및 빈 데이터 모두 크래시 없이 렌더됨을 검증한다.
// tennisStandingsSections.smoke.test.jsx 패턴 준수.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import { HBarChart, PlayerRadarChart } from '../tennisCharts';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({
    matches: false, media: q,
    addListener(){}, removeListener(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
  }),
});

// ThemeProvider + makeStyles 하네스
function Harness({ Comp, props }) {
  const { C } = useTheme();
  const ds = makeStyles(C);
  return createElement(Comp, { ...props, ds, C });
}
const render = (Comp, props) =>
  renderToStaticMarkup(
    createElement(ThemeProvider, null, createElement(Harness, { Comp, props }))
  );

// ── HBarChart 픽스처 ────────────────────────────────────────
const H2H_ROWS = [
  { label: '박준태', value: 0.75, note: '3-1 (75%)' },
  { label: '문형민', value: 0.33, note: '1-2 (33%)' },
  { label: '홍길동', value: 0.5,  note: '2-2 (50%)' },
];

// ── PlayerRadarChart 픽스처 ─────────────────────────────────
const RADAR_FULL = {
  player: '박준태',
  axes: [
    { key: 'singlesRate', label: '단식승률', value: 0.75, raw: '75%' },
    { key: 'doublesRate', label: '복식승률', value: 0.6,  raw: '60%' },
    { key: 'points',      label: '포인트',   value: 0.8,  raw: '16' },
    { key: 'attendance',  label: '참석',     value: 1.0,  raw: '12일' },
    { key: 'aces',        label: '에이스',   value: 0.5,  raw: '5' },
  ],
};

const RADAR_ALL_ZERO = {
  player: '신입선수',
  axes: [
    { key: 'singlesRate', label: '단식승률', value: 0, raw: '0%' },
    { key: 'doublesRate', label: '복식승률', value: 0, raw: '0%' },
    { key: 'points',      label: '포인트',   value: 0, raw: '0' },
    { key: 'attendance',  label: '참석',     value: 0, raw: '0일' },
    { key: 'aces',        label: '에이스',   value: 0, raw: '0' },
  ],
};

// ── 테스트 ──────────────────────────────────────────────────
describe('HBarChart 스모크', () => {
  it('픽스처 데이터로 크래시 없이 렌더 — 라벨·노트 포함', () => {
    const html = render(HBarChart, { rows: H2H_ROWS });
    expect(html).toContain('박준태');
    expect(html).toContain('문형민');
    expect(html).toContain('75%');
    expect(html).toContain('33%');
    // SVG 구조 확인
    expect(html).toContain('<svg');
  });

  it('빈 rows → "데이터 없음" 렌더, 크래시 없음', () => {
    const html = render(HBarChart, { rows: [] });
    expect(html).toContain('데이터 없음');
    expect(html).not.toContain('<svg');
  });

  it('rows=null → "데이터 없음" 렌더, 크래시 없음', () => {
    const html = render(HBarChart, { rows: null });
    expect(html).toContain('데이터 없음');
  });

  it('colorFor prop 없어도 크래시 없음 (기본 accent 사용)', () => {
    expect(() => render(HBarChart, { rows: H2H_ROWS, colorFor: undefined })).not.toThrow();
  });

  it('value=0 행도 크래시 없이 렌더됨', () => {
    const rows = [{ label: '홍길동', value: 0, note: '0-3 (0%)' }];
    const html = render(HBarChart, { rows });
    expect(html).toContain('홍길동');
    expect(html).toContain('0-3');
  });
});

describe('PlayerRadarChart 스모크', () => {
  it('픽스처 데이터로 크래시 없이 렌더 — 선수명·축 라벨·raw 포함', () => {
    const html = render(PlayerRadarChart, { radar: RADAR_FULL });
    expect(html).toContain('박준태');          // aria-label에 선수명
    expect(html).toContain('단식승률');
    expect(html).toContain('복식승률');
    expect(html).toContain('포인트');
    expect(html).toContain('참석');
    expect(html).toContain('에이스');
    expect(html).toContain('75%');             // raw 값
    expect(html).toContain('16');              // 포인트 raw
    expect(html).toContain('12일');            // 참석 raw
    expect(html).toContain('<svg');
    expect(html).toContain('<polygon');        // 폴리곤 렌더 확인
  });

  it('전 축 value=0 이어도 크래시 없음 (데이터 폴리곤 생략, 그리드만)', () => {
    const html = render(PlayerRadarChart, { radar: RADAR_ALL_ZERO });
    expect(html).toContain('신입선수');
    expect(html).toContain('<svg');
    // 데이터 폴리곤 없음 (allZero=true → fill/stroke polygon 미렌더)
    // 그리드 폴리곤은 있음
    expect(html).toContain('<polygon');
  });

  it('radar=null → "데이터 없음" 렌더, 크래시 없음', () => {
    const html = render(PlayerRadarChart, { radar: null });
    expect(html).toContain('데이터 없음');
    expect(html).not.toContain('<svg');
  });

  it('radar.axes=[] → "데이터 없음" 렌더, 크래시 없음', () => {
    const html = render(PlayerRadarChart, { radar: { axes: [], player: '박준태' } });
    expect(html).toContain('데이터 없음');
  });
});
