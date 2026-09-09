import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationRecorder from '../FormationRecorder';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const render = (props) => renderToStaticMarkup(createElement(ThemeProvider, null,
  createElement(FormationRecorder, {
    formation: '4-4-2', assignments: { 0: 'GK1', 1: 'D1' }, positionMap: { GK1: 'GK', D1: 'DF' },
    attendees: ['GK1', 'D1', 'BN1'], gk: 'GK1', opponent: '상대', startedAt: 1, events: [],
    onAddEvent(){}, onDeleteEvent(){}, onFinishMatch(){}, onStateChange(){}, onFlowActiveChange(){}, ...props,
  })));

describe('FormationRecorder 렌더 스모크', () => {
  it('크래시 없이 렌더', () => {
    const html = render({});
    expect(html).toContain('D1');
    // BN1 = 파생 벤치(참석자 − 피치위). getSubCandidates 유닛테스트는 헬퍼만 보고 JSX 배선은 안 덮어서 이 단언이 D2 렌더링 경로의 유일한 자동화 게이트.
    expect(html).toContain('BN1');
    expect(html).not.toContain('NaN');
  });

  // 골 표기는 SoccerMatchView 와 utils/soccerGoalEvent.goalLabel 을 공유한다.
  // 두 화면이 갈라지지 않는지 렌더 레벨에서 한 번 잡아둔다.
  it('골 표기가 "득점자(골)/어시(어시)" 형태다', () => {
    const html = render({ events: [
      { id: 'e1', type: 'goal', player: '주건호', assist: '신관수', timestamp: 2 },
      { id: 'e2', type: 'goal', player: '주건호', assist: null, timestamp: 3 },
    ] });
    expect(html).toContain('주건호(골)/신관수(어시)');
    expect(html).toContain('주건호(골)');
    expect(html).not.toContain('🅰️');
  });
});
