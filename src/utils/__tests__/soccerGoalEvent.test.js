import { describe, it, expect } from 'vitest';
import { goalEventFromTap, goalLabel } from '../soccerGoalEvent';

describe('goalEventFromTap — 본인 어시 차단', () => {
  it('득점자 선택 후 다른 선수를 탭하면 어시로 기록한다', () => {
    expect(goalEventFromTap({ type: 'selectAssist', scorer: '주건호' }, '신관수'))
      .toEqual({ type: 'goal', player: '주건호', assist: '신관수' });
  });

  // 축구에만 이 가드가 없어 "주건호(골)/주건호(어시)" 가 기록될 수 있었다.
  // 풋살 CourtRecorder.applyAssistRole 의 `if (myCompose.scorer === player) return;` 과 같은 규칙.
  it('득점자를 다시 탭하면 null — 탭을 무시한다', () => {
    expect(goalEventFromTap({ type: 'selectAssist', scorer: '주건호' }, '주건호')).toBeNull();
  });

  it('어시 먼저 흐름: 다른 선수를 탭하면 그 선수가 득점자', () => {
    expect(goalEventFromTap({ type: 'selectScorer', assister: '신관수' }, '주건호'))
      .toEqual({ type: 'goal', player: '주건호', assist: '신관수' });
  });

  it('어시 먼저 흐름: 어시 선수를 다시 탭하면 null', () => {
    expect(goalEventFromTap({ type: 'selectScorer', assister: '신관수' }, '신관수')).toBeNull();
  });

  it('goalFlow 가 없거나 모르는 타입이면 null', () => {
    expect(goalEventFromTap(null, '주건호')).toBeNull();
    expect(goalEventFromTap({ type: 'selectGk', scorer: '주건호' }, '신관수')).toBeNull();
  });
});

describe('goalLabel — 골/어시 표기', () => {
  it('어시가 있으면 골/어시를 함께', () => {
    expect(goalLabel('주건호', '신관수')).toBe('주건호(골)/신관수(어시)');
  });

  it('어시가 없으면 골만', () => {
    expect(goalLabel('주건호', null)).toBe('주건호(골)');
    expect(goalLabel('주건호', '')).toBe('주건호(골)');
    expect(goalLabel('주건호', undefined)).toBe('주건호(골)');
  });
});
