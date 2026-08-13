import { describe, it, expect } from 'vitest';
import { pct } from '../tennisFormat';

describe('pct', () => {
  it('양수 비율은 반올림 퍼센트', () => {
    expect(pct(0.5)).toBe('50%');
    expect(pct(1)).toBe('100%');
    expect(pct(0.333)).toBe('33%');
  });
  it('0 이하는 하이픈', () => {
    expect(pct(0)).toBe('-');
    expect(pct(-1)).toBe('-');
  });
});
