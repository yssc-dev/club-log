import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DefenseTopCardsView } from '../DefenseTopCards';
import { C as BASE } from '../../../../config/constants';

// 대시보드가 넘기는 C는 useTheme() 팔레트라 constants에 없는 borderColor를 갖는다
const C = { ...BASE, borderColor: 'var(--app-divider)' };
const m = (dfs, conceded) => ({ our_defenders_json: JSON.stringify(dfs), opponent_score: conceded });
const ds = { section: {}, sectionTitle: {}, card: {} };

// A·B는 10경기 전승 무실점, C·D는 10경기 매번 2실점 — 두 축 모두 순서가 뚜렷하게 갈린다
const logs = [
  ...Array.from({ length: 10 }, () => m(['A', 'B'], 0)),
  ...Array.from({ length: 10 }, () => m(['C', 'D'], 2)),
];

const render = (props) => renderToStaticMarkup(
  createElement(DefenseTopCardsView, { matchLogs: logs, C, ds, ...props }),
);

describe('DefenseTopCardsView', () => {
  it('카드 3종을 모두 노출한다', () => {
    const html = render({});
    expect(html).toContain('수비 페어 TOP5');
    expect(html).toContain('수비 실점률 TOP5');
    expect(html).toContain('클린시트율 TOP5');
  });

  it('실점률 카드는 Δ가 아니라 생값을 찍는다', () => {
    const html = render({});
    expect(html).toContain('0.00');
    expect(html).toContain('2.00');
    expect(html).not.toContain('+0.00'); // Δ 표기가 새어나오면 실패
  });

  it('클린시트율 카드는 % 생값을 찍는다', () => {
    const html = render({});
    expect(html).toContain('100%');
  });

  it('선수마다 출전 경기수를 함께 표기한다', () => {
    expect(render({})).toContain('10G');
  });

  it('좋은 수비가 위로 온다 (실점률 오름차순)', () => {
    const html = render({});
    expect(html.indexOf('0.00')).toBeLessThan(html.indexOf('2.00'));
  });

  it('표본 미달이면 카드를 통째로 숨긴다', () => {
    expect(render({ matchLogs: [m(['A', 'B'], 1)] })).toBe('');
  });

  it('수비수 기록이 아예 없어도 크래시 없이 숨긴다', () => {
    expect(render({ matchLogs: [] })).toBe('');
  });
});
