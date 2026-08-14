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

  // WORST 목록(나쁜 순)은 첫 행이 최댓값이 아니다 — rows[0]을 기준으로 삼으면
  // 나머지가 전부 100%로 잘려 막대가 다 꽉 찬다.
  it('나쁜 순으로 정렬된 목록도 실제 최댓값을 기준으로 그린다', () => {
    const worstFirst = [
      { player: '가', value: 1 },
      { player: '나', value: 5 },
      { player: '다', value: 10 },
    ];
    const html = render({ rows: worstFirst });
    expect(html).toContain('width:10%');  // 1/10
    expect(html).toContain('width:50%');  // 5/10
    expect(html).toContain('width:100%'); // 10/10
  });

  it('lowerIsBetter도 실제 최솟값을 기준으로 그린다', () => {
    const html = render({ rows: [{ player: '가', value: 2 }, { player: '나', value: 1 }], lowerIsBetter: true });
    expect(html).toContain('width:50%');  // 1/2
    expect(html).toContain('width:100%'); // 1/1
  });

  // 하위 N명 목록에 1·2위를 붙이면 '잘한 사람'으로 읽힌다
  it('showRank=false면 순위 번호를 숨긴다', () => {
    const html = render({ showRank: false });
    expect(html).not.toContain('1위');
    expect(html).toContain('가');
  });

  // 'A → B' 같은 방향쌍은 기본 이름폭에 안 들어간다
  it('nameWidth로 이름 칸 폭을 넓힐 수 있다', () => {
    expect(render({ nameWidth: 92 })).toContain('width:92px');
    expect(render({})).toContain('width:40px'); // 기본값
  });

  // BEST/WORST를 나란히 놓는 화면은 두 열이 같은 척도를 써야 비교가 성립한다.
  // 각 열이 자기 최댓값을 기준 삼으면 80%와 40%가 같은 길이로 그려진다.
  it('scaleRef를 주면 그 값을 기준으로 그린다 — 짝 열이 척도를 공유하도록', () => {
    const html = render({ rows: [{ player: '가', value: 0.4 }], scaleRef: 0.8 });
    expect(html).toContain('width:50%'); // 0.4 / 0.8
  });

  it('scaleRef가 lowerIsBetter에서도 기준이 된다', () => {
    const html = render({ rows: [{ player: '가', value: 2 }], scaleRef: 1, lowerIsBetter: true });
    expect(html).toContain('width:50%'); // 1 / 2
  });

  it('scaleRef가 없으면 종전처럼 목록 안 극값을 쓴다', () => {
    const html = render({ rows: [{ player: '가', value: 0.4 }] });
    expect(html).toContain('width:100%');
  });

  it('이름이 비어도 key가 충돌하지 않는다', () => {
    // 이름 없는 행이 둘이면 종전 key는 둘 다 '' 이라 React가 행을 잘못 재사용한다
    const html = render({ rows: [{ value: 5 }, { value: 3 }] });
    expect(html).not.toContain('NaN');
  });

  it('subWidth로 부가정보 칸을 넓힐 수 있다', () => {
    expect(render({ rows: [{ player: '가', value: 1, sub: '12R·0.50/R' }], subWidth: 58 }))
      .toContain('width:58px');
  });

  it('빈 목록은 안내문', () => {
    expect(render({ rows: [] })).toContain('표본 부족');
    expect(render({ rows: [], emptyText: '기록 없음' })).toContain('기록 없음');
  });

  it('NaN을 그리지 않는다', () => {
    expect(render({ rows: [{ player: '가', value: 0, rank: 1 }] })).not.toContain('NaN');
  });
});
