import { describe, it, expect } from 'vitest';
import { stripNameDecorations } from '../appSync';

describe('stripNameDecorations', () => {
  it('이름 문자열의 별표를 제거한다', () => {
    expect(stripNameDecorations('정보영★')).toBe('정보영');
  });

  it('별표가 없는 문자열은 그대로 둔다', () => {
    expect(stripNameDecorations('홍길동')).toBe('홍길동');
  });

  it('중첩된 객체/배열 안의 문자열까지 재귀적으로 제거한다 (writePlayerLog/writeRawEvents 페이로드 형태)', () => {
    const payload = {
      action: 'writeRawPlayerGames',
      data: {
        team: '마스터FC',
        players: [{ name: '조승훈★', point: 105 }],
        events: [{ scorer: '김진수★', assist: '홍길동' }],
      },
    };
    const out = stripNameDecorations(payload);
    expect(out.data.players[0].name).toBe('조승훈');
    expect(out.data.events[0].scorer).toBe('김진수');
    expect(out.data.events[0].assist).toBe('홍길동');
    expect(out.action).toBe('writeRawPlayerGames');
  });

  it('숫자/불리언/null/undefined 값은 그대로 둔다', () => {
    expect(stripNameDecorations(5)).toBe(5);
    expect(stripNameDecorations(true)).toBe(true);
    expect(stripNameDecorations(null)).toBe(null);
    expect(stripNameDecorations(undefined)).toBe(undefined);
  });
});
