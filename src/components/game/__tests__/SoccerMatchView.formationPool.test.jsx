// 포지션 입력(FormationSetup)의 선수 풀 회귀 가드.
// 8/18 실사고: 상대팀 선택 '후' 참석명단에 추가된 선수(김래상)가 배치 화면에 안 보였다.
// 원인 = 상대 선택 순간의 attendees 스냅샷(selectedPlayers)을 풀로 사용.
// 경기 중 교체 후보는 참석자 실시간 파생인데 최초 배치만 스냅샷이던 비대칭.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import SoccerMatchView from '../SoccerMatchView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(SoccerMatchView, {
    soccerMatches: [], currentMatchIdx: 0, opponents: ['한울'],
    // 상대 선택 시점 스냅샷에는 '김래상'이 없다 — 그 뒤 참석명단에 추가된 상황
    savedFormation: { viewState: 'formation', selectedOpponent: '한울', selectedPlayers: ['주건호', '김형욱'] },
    attendees: ['주건호', '김형욱', '김래상'],
    gameSettings: {}, styles: { section: {}, sectionTitle: {} },
    ...props,
  })));

describe('SoccerMatchView 포메이션 풀', () => {
  it('상대 선택 후 참석에 추가된 선수도 배치 후보에 보인다', () => {
    const html = render({});
    expect(html).toContain('김래상');
  });

  it('참석에서 빠진 선수는 후보에서도 빠진다 — 스냅샷이 유령 후보를 만들면 안 된다', () => {
    const html = render({ attendees: ['주건호'] });
    expect(html).toContain('주건호');
    expect(html).not.toContain('김형욱');
  });
});
