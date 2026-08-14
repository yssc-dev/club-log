import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import RankBarList, { barRatio } from '../RankBarList';
import { C } from '../../../../config/constants';

const rows = [
  { player: '가', value: 10, rank: 1 },
  { player: '나', value: 5, rank: 2 },
  { player: '다', value: 2, rank: 3 },
];
const render = (props) => renderToStaticMarkup(
  createElement(RankBarList, { rows, formatValue: v => `${v}회`, C, ...props }),
);

describe('barRatio', () => {
  it('기본은 1위 대비 비율', () => {
    expect(barRatio(10, 10, false)).toBeCloseTo(1);
    expect(barRatio(5, 10, false)).toBeCloseTo(0.5);
  });

  // 실점률·편차처럼 낮을수록 상위인 축 — 1위가 항상 최장이어야 한다
  it('lowerIsBetter면 1위(최소값) 대비 역수', () => {
    expect(barRatio(0.5, 0.5, true)).toBeCloseTo(1);
    expect(barRatio(1.0, 0.5, true)).toBeCloseTo(0.5);
  });

  it('0과 음수에 안전하다', () => {
    expect(barRatio(0, 0, false)).toBe(0);
    expect(barRatio(0, 0.5, true)).toBe(1);
    expect(barRatio(-1, 10, false)).toBe(0);
  });

  it('비율은 1을 넘지 않는다', () => {
    expect(barRatio(20, 10, false)).toBe(1);
    expect(barRatio(0.1, 0.5, true)).toBe(1);
  });
});

describe('RankBarList', () => {
  it('순위 번호·이름·값을 찍는다', () => {
    const html = render({});
    expect(html).toContain('1위');
    expect(html).toContain('가');
    expect(html).toContain('10회');
  });

  it('공동 순위를 그대로 보여준다 — 목록 순서만으로는 동률이 안 보인다', () => {
    const tied = [
      { player: '가', value: 5, rank: 1 },
      { player: '나', value: 5, rank: 1 },
      { player: '다', value: 1, rank: 3 },
    ];
    const html = render({ rows: tied });
    expect(html.split('1위').length - 1).toBe(2);
    expect(html).toContain('3위');
    expect(html).not.toContain('2위');
  });

  it('limit으로 잘라낸다', () => {
    const html = render({ limit: 2 });
    expect(html).toContain('나');
    expect(html).not.toContain('다');
  });

  it('부가정보(sub)가 있으면 우측에 붙인다', () => {
    const html = render({ rows: [{ player: '가', value: 3, rank: 1, sub: '8경기' }] });
    expect(html).toContain('8경기');
  });

  it('name 키도 이름으로 인정한다', () => {
    expect(render({ rows: [{ name: '홍길동', value: 1, rank: 1 }] })).toContain('홍길동');
  });

  it('rank가 없으면 순서대로 매긴다', () => {
    const html = render({ rows: [{ player: '가', value: 3 }, { player: '나', value: 1 }] });
    expect(html).toContain('1위');
    expect(html).toContain('2위');
  });

  it('빈 목록은 안내문', () => {
    expect(render({ rows: [] })).toContain('표본 부족');
    expect(render({ rows: [], emptyText: '기록 없음' })).toContain('기록 없음');
  });

  it('NaN을 그리지 않는다', () => {
    expect(render({ rows: [{ player: '가', value: 0, rank: 1 }] })).not.toContain('NaN');
  });
});
