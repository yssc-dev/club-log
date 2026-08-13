import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import OpponentLeadersView from '../OpponentLeadersView';
import { C } from '../../../../config/constants';

const match = (i, opp, extra = {}) => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: '1', game_id: `s_${i}`,
  opponent_team_name: opp, our_members_json: '["A","B","C"]',
  our_defenders_json: '["B","C"]', our_score: 1, opponent_score: i === 0 ? 2 : 0,
  ...extra,
});
const goal = (i, player, assist = '') => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: '1',
  event_type: 'goal', player, related_player: assist,
});

const matchLogs = [
  ...[0, 1, 2, 3, 4].map(i => match(i, '터틀파크')),
  ...[5, 6, 7, 8, 9].map(i => match(i, '한울')),
];
const eventLogs = [goal(0, 'A', 'B'), goal(1, 'A'), goal(5, 'C')];

const render = (props) => renderToStaticMarkup(
  createElement(OpponentLeadersView, { matchLogs, eventLogs, C, ...props }),
);

describe('OpponentLeadersView', () => {
  it('상대팀 선택 칩과 두 리더보드를 렌더한다', () => {
    const html = render({});
    expect(html).toContain('터틀파크');
    expect(html).toContain('한울');
    expect(html).toContain('경기당 포인트');
    expect(html).toContain('실점률');
    expect(html).not.toContain('NaN');
  });

  it('기본 선택은 경기수가 가장 많은 상대 — 그 팀 기록이 보인다', () => {
    const html = render({});
    expect(html).toContain('A');       // 터틀파크전 득점자
    expect(html).toContain('0.40P');   // A: 2골 / 5경기
  });

  it('수비 리더는 실점률 생값을 찍는다', () => {
    const html = render({});
    expect(html).toContain('0.40실점'); // B·C: 5경기 2실점
  });

  it('집계 구간을 캡션에 밝힌다', () => {
    expect(render({})).toContain('앱 기록 구간');
  });

  it('자격 있는 상대팀이 없으면 안내문', () => {
    const html = render({ matchLogs: [match(0, '길벗')], eventLogs: [] });
    expect(html).toContain('상대팀이 없습니다');
  });
});
