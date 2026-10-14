import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import SoccerMatchResults from '../SoccerMatchResults';

const s = {
  th: { padding: 4 },
  td: (highlight) => ({ padding: 4, fontWeight: highlight ? 700 : 400 }),
};

const matches = [
  {
    matchIdx: 0, opponent: '한울', status: 'finished',
    events: [
      { id: 'g1', type: 'goal', player: '이기세', assist: '신관수', timestamp: 1 },
      { id: 'g2', type: 'goal', player: '강지선', assist: null, timestamp: 2 },
      { id: 'oo', type: 'opponentOwnGoal', timestamp: 3 },
    ],
  },
  { matchIdx: 1, opponent: '아이콘', status: 'finished', events: [{ id: 'x', type: 'opponentGoal', currentGk: 'A', timestamp: 1 }] },
  { matchIdx: 2, opponent: '휴식', status: 'finished', events: [] },
  { matchIdx: 3, opponent: '터틀파크', status: 'playing', events: [] }, // playing은 제외
];

function render(props) {
  return renderToStaticMarkup(createElement(ThemeProvider, null, createElement(SoccerMatchResults, props)));
}

describe('SoccerMatchResults — 경기 결과 표(득점자/어시)', () => {
  it('CS 대신 각 경기 득점자(어시)를 표기한다', () => {
    const html = render({ matches, styles: s });
    // 헤더에 CS 없고 득점 열 존재
    expect(html).toContain('득점');
    expect(html).not.toContain('>CS<');
    // 골: 어시 있으면 "선수(어시)", 없으면 "선수", 상대자책 표기
    expect(html).toContain('이기세(신관수)');
    expect(html).toContain('강지선');
    expect(html).toContain('상대자책');
    // 무득점 경기(아이콘, 상대골만)는 "-"
    expect(html).toContain('-');
    // 휴식 경기 표기
    expect(html).toContain('휴식');
    // playing 경기(터틀파크)는 미표시
    expect(html).not.toContain('터틀파크');
    expect(html).not.toContain('NaN');
  });

  it('빈 배열/undefined에도 크래시하지 않는다', () => {
    expect(render({ matches: [], styles: s })).toContain('<table');
    expect(render({ matches: undefined, styles: s })).toContain('<table');
  });
});

// 역할 열(2026-10-14) — 기록 전송 전에 '누가 몇 번 찍었나/주심 봤나' 를 이 표에서 검토한다.
// 마감 화면과 보관소 상세가 이 컴포넌트를 공용으로 쓰므로 양쪽에 같이 나온다.
describe('SoccerMatchResults — 역할 열', () => {
  const withRoles = (roles) => ([{ matchIdx: 0, opponent: '한울', status: 'finished', events: [], roles }]);

  it('역할 열 헤더가 있다', () => {
    expect(render({ matches: withRoles({ camera: ['X'], referee: 'Y' }), styles: s })).toContain('역할');
  });

  it('지정된 촬영·주심을 모두 적는다', () => {
    const html = render({ matches: withRoles({ camera: ['X', 'Y'], referee: 'Z' }), styles: s });
    expect(html).toContain('X, Y');
    expect(html).toContain('Z');
  });

  it('한쪽만 공석이면 그 축만 — 로 적는다 (미지정이 눈에 띄게)', () => {
    const html = render({ matches: withRoles({ camera: ['X'], referee: '' }), styles: s });
    expect(html).toContain('X');
    expect(html).toContain('\u2014');       // em dash — 주심 공석
  });

  it('전원 공석이면 - 한 글자', () => {
    const html = render({ matches: withRoles({ camera: [], referee: '' }), styles: s });
    expect(html).not.toContain('\ud83c\udfa5');   // 🎥 아이콘조차 없다
  });

  it('roles 가 없는 레거시 경기도 크래시하지 않는다', () => {
    expect(() => render({ matches: [{ matchIdx: 0, opponent: '한울', status: 'finished', events: [] }], styles: s })).not.toThrow();
  });

  it('RTDB 드롭 모양({referee}만 도착)도 읽는다 — readRoles 경유', () => {
    expect(render({ matches: withRoles({ referee: 'Z' }), styles: s })).toContain('Z');
  });

  // ★ 다른 축이 비어 있으면 셀이 '-' 로 조기 반환돼 부심 표시 여부를 검사할 수 없다
  //   (실제로 그 케이스로 쓰다가 공허한 테스트임을 확인했다). 촬영·주심을 채워 셀 본문을
  //   렌더시킨 뒤 부심 이름과 🚩 가 없는지 본다.
  it('레거시 부심은 표시하지 않는다', () => {
    const html = render({ matches: withRoles({ camera: ['X'], referee: 'Y', assistants: ['최D'] }), styles: s });
    expect(html).toContain('X');            // 셀이 실제로 렌더됐다는 증거
    expect(html).not.toContain('최D');
    expect(html).not.toContain('\ud83d\udea9');   // 🚩
  });
});
