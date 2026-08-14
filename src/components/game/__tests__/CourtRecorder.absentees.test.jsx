import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CourtRecorder from '../CourtRecorder';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 2026-08-13 마스터FC 1라운드 B구장 실제 상태:
// 이영문은 팀관수(3) 용병인데 휴식 기록은 팀동규(2)에, 조정은 그 반대로 박혀 있었다.
// → 화면엔 휴식 표시가 없는데 GK 지정만 "휴식 중인 선수입니다"로 막혔다.
const 팀동규 = ['이동규', '노필선', '조경준', '남인진', '김영중', '배민철'];
const 팀관수 = ['신관수', '김의선', '제갈종주', '윤대운', '김진수', '황세원'];
const GHOST = { R1_C1: { 2: ['이영문'], 3: ['조정'] } };

const props = (over = {}) => ({
  matchInfo: {
    homeIdx: 2, awayIdx: 3, matchId: 'R1_C1',
    homeTeam: '팀동규', awayTeam: '팀관수',
    homeGk: '남인진', awayGk: '김진수',
    homeColor: { bg: '#5856d6' }, awayColor: { bg: '#ff9500' },
  },
  homePlayers: 팀동규, awayPlayers: 팀관수,
  allEvents: [], onRecordEvent(){}, onUndoEvent(){}, onDeleteEvent(){}, onEditEvent(){},
  onFinish(){}, onGkChange(){}, styles: {}, courtLabel: 'B구장',
  attendees: [...팀동규, ...팀관수, '이영문', '조정'],
  mercs: [{ player: '조정', side: 'home' }, { player: '이영문', side: 'away' }],
  onAddMerc(){}, onRemoveMerc(){}, onToggleAbsent(){},
  ...over,
});

const renderHtml = (over) => renderToStaticMarkup(
  createElement(ThemeProvider, null, createElement(CourtRecorder, props(over))));

describe('CourtRecorder — 매치별 휴식 렌더', () => {
  it('그 팀 명단에 없는 유령 휴식 기록은 무시된다', () => {
    const html = renderHtml({ absentees: GHOST });
    expect(html).toContain('이영문');
    expect(html).toContain('조정');
    expect(html.match(/aria-label="휴식"/g)).toBeNull();
  });

  it('정상 휴식 기록은 그 팀 카드에 배지로 표시된다', () => {
    const html = renderHtml({ absentees: { R1_C1: { 2: ['남인진'], 3: ['이영문'] } } });
    expect(html.match(/aria-label="휴식"/g)).toHaveLength(2);
  });

  it('휴식 기록이 없으면 배지 없음 · 크래시 없음', () => {
    const html = renderHtml({ absentees: {} });
    expect(html).toContain('팀동규');
    expect(html).toContain('팀관수');
    expect(html.match(/aria-label="휴식"/g)).toBeNull();
    expect(html).not.toContain('NaN');
  });
});

// ── 실제 클릭 경로 (SSR 마크업으로는 핸들러 차단을 못 잡음) ──
describe('CourtRecorder — 휴식 차단은 자기 팀 기준', () => {
  let container, root, alerts, origAlert;

  beforeEach(() => {
    alerts = [];
    origAlert = window.alert;
    window.alert = (msg) => alerts.push(msg);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.alert = origAlert;
  });

  const mount = (over) => act(() => {
    root.render(createElement(ThemeProvider, null, createElement(CourtRecorder, props(over))));
  });

  // 카드 탭 → 팝오버 → 버튼 텍스트로 찾아 클릭
  const tapRole = (player, roleText) => {
    const card = [...container.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === `${player} 역할 선택`);
    expect(card, `${player} 카드가 렌더되지 않음`).toBeTruthy();
    act(() => card.click());
    // 팝오버는 카드와 같은 wrapper 안에 렌더됨 — 다른 카드/툴바 버튼과 섞이지 않게 범위 한정
    const btn = [...card.parentElement.querySelectorAll('button')]
      .find(b => b !== card && b.textContent.includes(roleText));
    expect(btn, `${player} 팝오버에 ${roleText} 버튼이 없음`).toBeTruthy();
    act(() => btn.click());
  };

  it('반대 팀에 남은 휴식 기록은 GK 지정을 막지 않는다', () => {
    const calls = [];
    mount({ absentees: GHOST, onGkChange: (teamIdx, p) => calls.push([teamIdx, p]) });
    tapRole('이영문', 'GK');
    expect(alerts).toEqual([]);
    expect(calls).toEqual([[3, '이영문']]);
  });

  it('반대 팀에 남은 휴식 기록은 골 입력도 막지 않는다', () => {
    mount({ absentees: GHOST });
    tapRole('이영문', '골');
    expect(alerts).toEqual([]);
    expect(container.textContent).toContain('어시: 선수 탭'); // compose 진입 성공
  });

  it('용병 버튼을 누르면 용병 목록으로 스크롤된다', () => {
    const scrolled = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (opt) { scrolled.push([this.textContent, opt]); };
    try {
      mount({ absentees: {} });
      // 카드의 '용병' 배지와 구분 — 추가 버튼은 텍스트가 '용병' 하나뿐
      const btn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '용병');
      expect(btn, '용병 추가 버튼을 찾지 못함').toBeTruthy();
      act(() => btn.click());
      expect(container.textContent).toContain('에 추가'); // 목록 열림
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0][0]).toContain('에 추가'); // 스크롤 대상 = 용병 목록
      expect(scrolled[0][1]).toMatchObject({ block: 'center' });
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  it('자기 팀 휴식 기록은 여전히 GK 지정을 막는다', () => {
    const calls = [];
    mount({
      absentees: { R1_C1: { 3: ['이영문'] } },
      onGkChange: (teamIdx, p) => calls.push([teamIdx, p]),
    });
    tapRole('이영문', 'GK');
    expect(alerts).toEqual(['휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요.']);
    expect(calls).toEqual([]);
  });
});
