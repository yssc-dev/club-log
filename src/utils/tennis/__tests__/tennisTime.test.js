import { describe, it, expect } from 'vitest';
import { toKSTString, nowKST } from '../tennisTime';

describe('toKSTString', () => {
  it('UTC 시각을 KST(+9h) YYYY-MM-DD HH:mm:ss로 변환', () => {
    // 2026-08-12T12:00:00Z → KST 2026-08-12 21:00:00
    expect(toKSTString(new Date('2026-08-12T12:00:00Z'))).toBe('2026-08-12 21:00:00');
    // 자정 넘김: 2026-08-12T16:00:00Z → KST 2026-08-13 01:00:00
    expect(toKSTString(new Date('2026-08-12T16:00:00Z'))).toBe('2026-08-13 01:00:00');
    // 2자리 패딩
    expect(toKSTString(new Date('2026-01-05T00:05:03Z'))).toBe('2026-01-05 09:05:03');
  });
});

describe('nowKST', () => {
  it('현재 시각 KST 문자열, 포맷 일치', () => {
    expect(nowKST()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
