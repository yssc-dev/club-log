import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import OpponentBreakdownList from '../OpponentBreakdownList';
import { C } from '../../../../config/constants';

const rows = [{ opponent: '한울', games: 17, wins: 11, draws: 4, losses: 2 }];

// 나(김형욱)는 공격 3위, 수비 2위 — 위아래 이웃이 모두 있는 자리
const attackByOpponent = {
  한울: [
    { name: '주건호', attackPoints: 20, goals: 12, assists: 8, rank: 1 },
    { name: '김준식', attackPoints: 18, goals: 10, assists: 8, rank: 2 },
    { name: '김형욱', attackPoints: 15, goals: 6, assists: 9, rank: 3 },
    { name: '정경훈', attackPoints: 9, goals: 5, assists: 4, rank: 4 },
    { name: '박성언', attackPoints: 4, goals: 2, assists: 2, rank: 5 },
    { name: '양병선', attackPoints: 1, goals: 1, assists: 0, rank: 6 },
  ],
};
const defenseByOpponent = {
  한울: [
    { name: '김민중', concededPerGame: 0.17, games: 6, rank: 1 },
    { name: '김형욱', concededPerGame: 0.22, games: 9, rank: 2 },
    { name: '신관수', concededPerGame: 0.4, games: 10, rank: 3 },
  ],
};

const render = (props) => renderToStaticMarkup(
  createElement(OpponentBreakdownList, {
    rows, playerName: '김형욱', attackByOpponent, defenseByOpponent, C, ...props,
  }),
);

describe('OpponentBreakdownList', () => {
  it('상대팀 헤더에 경기수와 승무패', () => {
    const html = render({});
    expect(html).toContain('한울');
    expect(html).toContain('17경기');
    expect(html).toContain('11-4-2');
  });

  it('공격 차트는 내 순위 위아래 2명씩만 보여준다', () => {
    const html = render({});
    for (const n of ['주건호', '김준식', '김형욱', '정경훈', '박성언']) expect(html).toContain(n);
    expect(html).not.toContain('양병선'); // 6위 — 창 밖
  });

  it('행에는 등수·이름·값만 — 폭이 절반이라 행마다 골/어시를 붙이지 않는다', () => {
    const html = render({});
    expect(html).toContain('3위');
    expect(html).toContain('15P');
    // 이웃(1위 주건호 12골 8어시)의 골/어시는 행에 안 나온다
    expect(html).not.toContain('12골');
  });

  it('내 골/어시·경기수는 각 열 아래 요약으로 한 번만', () => {
    const html = render({});
    expect(html).toContain('6골 9어시'); // 내 공격
    expect(html).toContain('9경기');     // 내 수비 출전
  });

  it('공격·수비 두 열을 나란히 둔다', () => {
    const html = render({});
    expect(html).toContain('공격');
    expect(html).toContain('수비');
    expect(html).toContain('0.22실점');
  });

  it('내 수비 기록이 없는 상대는 없음으로 표기', () => {
    const html = render({ defenseByOpponent: { 한울: [{ name: '김민중', concededPerGame: 0.17, games: 6, rank: 1 }] } });
    expect(html).toContain('수비 기록 없음');
    expect(html).not.toContain('NaN');
  });

  it('수비 목록 자체가 없어도 안전', () => {
    const html = render({ defenseByOpponent: {} });
    expect(html).toContain('수비 기록 없음');
    expect(html).not.toContain('NaN');
  });

  it('내 행을 강조한다 — 이웃과 구분되는 표시가 있다', () => {
    const html = render({});
    // 강조 마커(◀)가 정확히 두 번: 공격 1회 + 수비 1회
    expect(html.split('◀').length - 1).toBe(2);
  });

  it('기록이 없으면 아무것도 안 그린다', () => {
    expect(render({ rows: [] })).toBe('');
  });
});
