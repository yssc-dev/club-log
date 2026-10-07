// RoleRecordTab 렌더 스모크 — 표시 전용이라 renderToStaticMarkup(analyticsTabs.smoke 패턴).
// build/vitest 가 못 잡는 렌더 크래시(TDZ·undefined 접근) 방어가 목적.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../../hooks/useTheme';
import RoleRecordTab from '../RoleRecordTab';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const C = {
  white: '#fff', gray: '#888', grayLight: '#bbb', grayDark: '#444', grayDarker: '#333',
  black: '#000', bg: '#111', card: '#1a1a1a', cardLight: '#222', accent: '#0f0',
  green: '#0f0', red: '#f00', yellow: '#ff0', orange: '#f80',
};

const render = (props) =>
  renderToStaticMarkup(createElement(ThemeProvider, null, createElement(RoleRecordTab, { C, ...props })));

const logs = [
  { roles_json: JSON.stringify({ camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] }) },
  { roles_json: JSON.stringify({ camera: ['김A'], referee: '박C', assistants: [] }) },
  { roles_json: '' },
];

describe('RoleRecordTab', () => {
  it('matchLogs 없이도 크래시하지 않고 빈 상태 문구를 띄운다', () => {
    const html = render({ matchLogs: [] });
    expect(html).toContain('역할 기록이 아직 없습니다');
  });

  it('matchLogs 가 undefined 여도 크래시하지 않는다', () => {
    expect(() => render({})).not.toThrow();
  });

  it('레거시 행(roles_json 빈칸)만 있으면 빈 상태 문구', () => {
    expect(render({ matchLogs: [{ roles_json: '' }, { date: '2026-01-01' }] }))
      .toContain('역할 기록이 아직 없습니다');
  });

  it('집계 결과를 표로 그린다 — 이름과 합계가 보인다', () => {
    const html = render({ matchLogs: logs });
    expect(html).not.toContain('역할 기록이 아직 없습니다');
    expect(html).toContain('김A');
    expect(html).toContain('박C');
    expect(html).toContain('최D');
    expect(html).toContain('영상촬영');
    expect(html).toContain('주심');
    expect(html).toContain('부심');
    expect(html).toContain('합계');
  });

  it('"촬영감독" 문구를 쓰지 않는다', () => {
    expect(render({ matchLogs: logs })).not.toContain('촬영감독');
  });

  it('깨진 roles_json 이 섞여도 렌더된다', () => {
    const html = render({ matchLogs: [{ roles_json: '{nope' }, ...logs] });
    expect(html).toContain('김A');
  });
});
