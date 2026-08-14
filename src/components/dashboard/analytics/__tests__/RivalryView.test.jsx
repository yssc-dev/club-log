import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import RivalryView from '../RivalryView';
import { C } from '../../../../config/constants';

// 라운드 로테이션: A는 B와 자주 붙어 이기고, C에게는 자주 진다.
// calcRivalry는 our/opponent 양쪽을 같은 클럽 선수로 보고 대결 전적을 만든다.
const m = (i, our, opp, ourScore, oppScore) => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: `R${i}_C1`,
  our_members_json: JSON.stringify(our), opponent_members_json: JSON.stringify(opp),
  our_score: ourScore, opponent_score: oppScore,
});
const matchLogs = [
  // A vs B — A가 6전 6승
  ...Array.from({ length: 6 }, (_, i) => m(i, ['A'], ['B'], 3, 0)),
  // A vs C — A가 5전 1승 4패
  ...Array.from({ length: 4 }, (_, i) => m(i + 10, ['A'], ['C'], 0, 2)),
  m(20, ['A'], ['C'], 2, 0),
];

const render = (props) => renderToStaticMarkup(
  createElement(RivalryView, { matchLogs, player: 'A', C, ...props }),
);

describe('RivalryView', () => {
  // 개인분석 탭 하단으로 옮기면서 선수 선택은 그 탭의 드롭다운이 맡는다
  it('자체 드롭다운 없이 player prop을 따른다', () => {
    const html = render({});
    expect(html).not.toContain('<select');
    expect(html).toContain('B'); // A의 상대
  });

  it('player를 바꾸면 그 선수 기준으로 다시 그린다', () => {
    expect(render({ player: 'A' })).not.toBe(render({ player: 'B' }));
  });

  it('player가 없으면 안내문', () => {
    expect(render({ player: null })).toContain('대결 기록이 없습니다');
  });

  // 기존에는 계산층이 준 순서(경기수 내림차순)를 그대로 써서 승수가 오르내렸다
  it('전체 상대 전적을 승수 내림차순으로 세운다', () => {
    const html = render({});
    // A는 B 상대 6승, C 상대 1승 → B가 먼저
    expect(html.indexOf('vs B')).toBeLessThan(html.indexOf('vs C'));
  });

  it('천적·맛집과 전체 전적을 함께 보여준다', () => {
    const html = render({});
    expect(html).toContain('천적');
    expect(html).toContain('맛집');
    expect(html).toContain('전체 상대 전적');
    expect(html).not.toContain('NaN');
  });
});
