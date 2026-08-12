import { describe, it, expect } from 'vitest';
import { defaultDirFor, nextSort, sortRows } from '../sortRows';

describe('defaultDirFor', () => {
  it('숫자는 desc, 문자는 asc', () => {
    expect(defaultDirFor(5)).toBe('desc');
    expect(defaultDirFor('가')).toBe('asc');
  });
});

describe('nextSort', () => {
  it('다른 key면 defaultDir로 활성화', () => {
    expect(nextSort(null, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
  });
  it('같은 key면 토글', () => {
    expect(nextSort({ key: 'rate', dir: 'desc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'asc' });
    expect(nextSort({ key: 'rate', dir: 'asc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [{ n: '나', v: 2 }, { n: '가', v: 3 }, { n: '다', v: 2 }];
  it('숫자 desc', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.v)).toEqual([3, 2, 2]);
  });
  it('숫자 asc', () => {
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.v)).toEqual([2, 2, 3]);
  });
  it('한글 asc localeCompare', () => {
    expect(sortRows(rows, r => r.n, 'asc').map(r => r.n)).toEqual(['가', '나', '다']);
  });
  it('동값이면 원래 순서 보존(안정)', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.n)).toEqual(['가', '나', '다']);
  });
  it('원본 배열 불변', () => {
    const copy = [...rows];
    sortRows(rows, r => r.v, 'desc');
    expect(rows).toEqual(copy);
  });
});
