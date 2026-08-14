import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import OpponentBreakdownList from '../OpponentBreakdownList';
import { C } from '../../../../config/constants';

const attackRow = {
  opponent: '한울', games: 17, wins: 11, draws: 4, losses: 2,
  goals: 6, assists: 9, attackPoints: 15, attackRank: 3, attackPool: 43,
  pointsPerGame: 15 / 17,
};
const defenseRows = [
  { opponent: '한울', games: 9, conceded: 4, concededPerGame: 4 / 9, rank: 2, pool: 12 },
];

const render = (props) => renderToStaticMarkup(
  createElement(OpponentBreakdownList, { rows: [attackRow], defenseRows, C, ...props }),
);

describe('OpponentBreakdownList', () => {
  it('상대팀 헤더에 경기수와 승무패를 표기', () => {
    const html = render({});
    expect(html).toContain('한울');
    expect(html).toContain('17경기');
    expect(html).toContain('11-4-2');
  });

  it('공격칸: 공격포인트 총합 · 골/어시 · 순위', () => {
    const html = render({});
    expect(html).toContain('공격');
    expect(html).toContain('15P');
    expect(html).toContain('6골');
    expect(html).toContain('9어시');
    expect(html).toContain('3위');
    expect(html).toContain('43명');
  });

  it('수비칸: 경기당 실점 · 순위', () => {
    const html = render({});
    expect(html).toContain('수비');
    expect(html).toContain('0.44실점');
    expect(html).toContain('2위');
    expect(html).toContain('12명');
  });

  it('수비 기록이 없는 상대는 없음으로 표기한다', () => {
    const html = render({ defenseRows: [] });
    expect(html).toContain('수비 기록 없음');
    expect(html).not.toContain('NaN');
  });

  it('상대가 달라도 수비 행을 상대팀으로 맞춰 붙인다', () => {
    const html = render({ defenseRows: [{ ...defenseRows[0], opponent: '아이콘' }] });
    expect(html).toContain('수비 기록 없음'); // 한울 행에 아이콘 수비가 붙으면 안 된다
  });

  it('기록이 없으면 아무것도 안 그린다', () => {
    expect(render({ rows: [] })).toBe('');
  });
});
