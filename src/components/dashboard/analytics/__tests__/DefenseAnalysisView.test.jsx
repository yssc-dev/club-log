import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import DefenseAnalysisView from '../DefenseAnalysisView';
import { C } from '../../../../config/constants';

const m = (dfs, conceded) => ({ our_defenders_json: JSON.stringify(dfs), opponent_score: conceded });

// 기본 임계(개인 8·페어 5)를 넘기는 최소 로그 — A·B가 10경기, C·D가 10경기
const logs = [
  ...Array.from({ length: 10 }, (_, i) => m(['A', 'B'], i % 3)),
  ...Array.from({ length: 10 }, (_, i) => m(['C', 'D'], (i % 2) + 1)),
];

const render = (props) => renderToStaticMarkup(
  createElement(DefenseAnalysisView, { matchLogs: logs, C, ...props }),
);

describe('DefenseAnalysisView', () => {
  it('지표 토글 두 개를 노출한다', () => {
    const html = render({});
    expect(html).toContain('실점률');
    expect(html).toContain('클린시트율');
  });

  it('페어·개인 행을 크래시 없이 렌더', () => {
    const html = render({});
    expect(html).toContain('A·B');
    expect(html).toContain('C·D');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('기본 지표는 실점률 — 생값과 부값 CS가 함께 보인다', () => {
    const html = render({});
    expect(html).toContain('실점');
    expect(html).toContain('CS ');
  });

  it('수비수 기록이 없으면 안내문', () => {
    expect(render({ matchLogs: [] })).toContain('수비수 기록이 있는 경기가 없습니다');
  });
});
