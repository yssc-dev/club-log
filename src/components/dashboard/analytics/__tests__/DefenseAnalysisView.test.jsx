import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import DefenseAnalysisView, { DefenseComboSection } from '../DefenseAnalysisView';
import { calcDefenseAnalysis } from '../../../../utils/soccerAnalytics';
import { C } from '../../../../config/constants';

const m = (dfs, conceded) => ({ our_defenders_json: JSON.stringify(dfs), opponent_score: conceded });

// A·B·C는 10경기 전부 무실점, D·E·F는 10경기 전부 2실점.
// 페어 임계(5)·트리오 임계(3)를 모두 넘기고 두 축의 순서가 뚜렷하게 갈린다.
const logs = [
  ...Array.from({ length: 10 }, () => m(['A', 'B', 'C'], 0)),
  ...Array.from({ length: 10 }, () => m(['D', 'E', 'F'], 2)),
];
const d = calcDefenseAnalysis({ matchLogs: logs });

const renderView = (props) => renderToStaticMarkup(
  createElement(DefenseAnalysisView, { matchLogs: logs, C, ...props }),
);
const renderSection = (props) => renderToStaticMarkup(
  createElement(DefenseComboSection, { d, metric: 'conceded', size: 'pair', C, ...props }),
);

describe('DefenseAnalysisView', () => {
  it('조합 토글과 지표 토글을 모두 노출한다', () => {
    const html = renderView({});
    for (const label of ['2인', '3인', '실점률', '클린시트율']) expect(html).toContain(label);
  });

  it('조합 토글이 지표 토글보다 위에 온다', () => {
    const html = renderView({});
    expect(html.indexOf('2인')).toBeLessThan(html.indexOf('실점률'));
  });

  it('수비수 기록이 없으면 안내문', () => {
    expect(renderView({ matchLogs: [] })).toContain('수비수 기록이 있는 경기가 없습니다');
  });
});

describe('DefenseComboSection', () => {
  it('2인 모드는 페어를 보여주고 경고 문구가 없다', () => {
    const html = renderSection({ size: 'pair' });
    expect(html).toContain('A·B');
    expect(html).not.toContain('A·B·C');
    expect(html).not.toContain('표본이 적어');
  });

  it('3인 모드는 트리오와 저신뢰 경고 문구를 함께 보여준다', () => {
    const html = renderSection({ size: 'trio' });
    expect(html).toContain('A·B·C');
    expect(html).toContain('표본이 적어');
  });

  it('행에는 해당 지표 값만 찍는다 — CS 병기 없음', () => {
    const html = renderSection({ metric: 'conceded' });
    expect(html).toContain('0.00실점');
    expect(html).not.toContain('CS ');
  });

  it('클린시트율 모드는 % 값만 찍는다 — 실점률 값이 새어나오지 않는다', () => {
    const html = renderSection({ metric: 'clean' });
    expect(html).toContain('100%');
    expect(html).not.toContain('0.00실점');
    expect(html).not.toContain('2.00실점');
  });

  it('제목이 생값 정렬 기준을 그대로 말한다', () => {
    expect(renderSection({ metric: 'conceded' })).toContain('실점 적은순');
    expect(renderSection({ metric: 'clean' })).toContain('무실점률 높은순');
  });

  it('BEST는 생값이 좋은 쪽부터 — 실점률은 낮은 값이 위', () => {
    const html = renderSection({ metric: 'conceded' });
    expect(html.indexOf('0.00실점')).toBeLessThan(html.indexOf('2.00실점'));
  });

  it('표본 미달이면 안내문', () => {
    const empty = calcDefenseAnalysis({ matchLogs: [m(['A', 'B'], 1)] });
    expect(renderSection({ d: empty, size: 'trio' })).toContain('표본 부족');
  });
});
