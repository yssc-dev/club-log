// 베스트 듀오 카드 3장(풋살) 렌더 + ChemistryTab 종목 분기.
// 실제 팔레트 C를 쓴다 — 가짜 테마 객체는 존재하지 않는 키 사용을 영원히 못 잡는다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import DuoCardsView from '../DuoCardsView';
import ChemistryTab from '../ChemistryTab';
import { C } from '../../../../config/constants';

const render = (comp, props) => renderToStaticMarkup(createElement(comp, { C, ...props }));

const row = (date, id, members, our, opp, gk) => ({
  date, match_id: id,
  our_members_json: JSON.stringify(members), opponent_members_json: '[]',
  our_score: our, opponent_score: opp, our_gk: gk, opponent_gk: '', is_extra: false,
});
const goal = (scorer, assister) => ({ event_type: 'goal', player: scorer, related_player: assister });

// 가|나: 05-07 두 라운드 둘 다 필드(2승·0실점), 05-14는 가가 GK라 제외 → 필드 1일, 전체 2일
const matchLogs = [
  row('2026-05-07', 'R1_C0', ['가', '나', '다'], 2, 0, '다'),
  row('2026-05-07', 'R2_C0', ['가', '나', '다'], 1, 0, '다'),
  row('2026-05-14', 'R1_C0', ['가', '나', '다'], 0, 1, '가'),
];
const eventLogs = [goal('나', '가'), goal('나', '가'), goal('나', '가'), goal('가', '나')];

describe('DuoCardsView', () => {
  it('카드 3장 제목을 그린다', () => {
    const html = render(DuoCardsView, { matchLogs, eventLogs });
    expect(html).toContain('합작 골');
    expect(html).toContain('동반 승리');
    expect(html).toContain('실점 억제');
    expect(html).not.toContain('NaN');
  });

  it('합작 골: 양방향 합을 값으로, 방향별 수를 보조로', () => {
    const html = render(DuoCardsView, { matchLogs, eventLogs });
    expect(html).toContain('가 + 나');
    expect(html).toContain('4골');
    // members 가나다순 [가, 나]: 가 득점(나 어시) 1 · 나 득점(가 어시) 3
    expect(html).toContain('1·3');
  });

  it('동반 승리: 필드 라운드 승수와 승률·경기일을 그린다', () => {
    const html = render(DuoCardsView, { matchLogs, eventLogs });
    expect(html).toContain('2승');
    expect(html).toContain('100%·1일');
  });

  it('실점 억제: 경기당 실점과 무실점 수, 진입선 경기일을 그린다', () => {
    const html = render(DuoCardsView, { matchLogs, eventLogs });
    expect(html).toContain('0.00');
    expect(html).toContain('무실점 2');
    // 최대 1일 × 30% 올림 = 1일
    expect(html).toContain('경기일 1일 이상');
  });

  it('GK 라운드 제외 규칙을 안내문에 명시하고 옛 "미입력" 문구는 쓰지 않는다', () => {
    const html = render(DuoCardsView, { matchLogs, eventLogs });
    expect(html).toContain('GK로 뛴 라운드는 제외');
    expect(html).not.toContain('미입력');
  });

  it('데이터가 없으면 카드마다 표본 부족', () => {
    const html = render(DuoCardsView, { matchLogs: [], eventLogs: [] });
    expect(html.split('표본 부족').length - 1).toBe(3);
    expect(html).not.toContain('NaN');
  });
});

describe('ChemistryTab 베스트 듀오 분기', () => {
  it('풋살은 카드 3장, 케미 랭킹 아님', () => {
    const html = render(ChemistryTab, { matchLogs, eventLogs, isSoccer: false });
    expect(html).toContain('합작 골');
    expect(html).not.toContain('케미 =');
  });

  it('축구는 기존 GoldenTrioView 유지', () => {
    const html = render(ChemistryTab, { matchLogs: [], eventLogs: [], isSoccer: true });
    expect(html).not.toContain('합작 골');
    expect(html).toContain('로그_매치 데이터가 없습니다');
  });

  // 어시페어(방향별 어시→골)는 합작 골 카드(양방향 합)와 재료가 같아 풋살에서는 중복 — 2026-11-06 제거.
  // 서브탭이 하나만 남으면 탭 버튼 줄 자체를 그리지 않는다.
  it('풋살은 어시페어 서브탭이 없고 서브탭 버튼 줄도 없다', () => {
    const html = render(ChemistryTab, { matchLogs, eventLogs, isSoccer: false });
    expect(html).not.toContain('어시페어');
    // '베스트 듀오'는 서브탭 버튼 레이블(카드 제목에는 없음) — 버튼 줄 자체가 없어야 한다
    expect(html).not.toContain('베스트 듀오');
  });

  it('축구는 어시페어 서브탭 버튼이 남는다', () => {
    const html = render(ChemistryTab, { matchLogs: [], eventLogs: [], isSoccer: true });
    expect(html).toContain('베스트 듀오');
    expect(html).toContain('어시페어');
  });
});
