import { describe, it, expect } from 'vitest';
import { stripNameDecorations } from '../appSync';

describe('stripNameDecorations', () => {
  it('이름 문자열의 별표를 제거한다', () => {
    expect(stripNameDecorations('정보영★')).toBe('정보영');
  });

  it('별표가 없는 문자열은 그대로 둔다', () => {
    expect(stripNameDecorations('홍길동')).toBe('홍길동');
  });

  // 참석명단 시트가 "정보영 ★"처럼 이름과 별표 사이에 공백을 넣는 실제 사례.
  // 별표만 지우면 "정보영 "(트레일링 공백)이 로그 시트로 전송돼 이름 매칭이 깨진다.
  it('이름과 별표 사이 공백까지 제거한다', () => {
    expect(stripNameDecorations('정보영 ★')).toBe('정보영');
  });

  it('별표에서 파생된 팀명("팀보영 ★")도 공백 없이 정리된다', () => {
    expect(stripNameDecorations('팀보영 ★')).toBe('팀보영');
  });

  it('앞쪽 별표/공백도 남기지 않는다', () => {
    expect(stripNameDecorations('★ 정보영')).toBe('정보영');
  });

  it('별표 없는 문자열의 공백은 건드리지 않는다', () => {
    expect(stripNameDecorations('메모 내용 ')).toBe('메모 내용 ');
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
