import { describe, it, expect } from 'vitest';
import { safeKey, safeTeam, cachePath } from '../rtdbPath';

describe('safeTeam', () => {
  it('RTDB 금지문자를 밑줄로 바꾼다', () => {
    expect(safeTeam('마스터.FC#1$/[x]')).toBe('마스터_FC_1___x_');
  });
  it('빈 값이면 기본팀', () => {
    expect(safeTeam('')).toBe('기본팀');
    expect(safeTeam(null)).toBe('기본팀');
    expect(safeTeam(undefined)).toBe('기본팀');
  });
  it('정상 팀명은 그대로', () => {
    expect(safeTeam('몽피스')).toBe('몽피스');
    expect(safeTeam('하버FC')).toBe('하버FC');
  });
});

describe('safeKey', () => {
  it('빈 값이면 지정한 폴백', () => {
    expect(safeKey('', '기타')).toBe('기타');
  });
});

describe('cachePath', () => {
  it('cache/{team}/{sport}/{dataset}/{shard} 형태', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames'))
      .toBe('cache/몽피스/테니스/playerGames/all');
  });
  it('shard를 지정할 수 있다', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames', '2026'))
      .toBe('cache/몽피스/테니스/playerGames/2026');
  });
  it('team/sport의 금지문자를 정리한다', () => {
    expect(cachePath('a.b', 'c#d', 'roster')).toBe('cache/a_b/c_d/roster/all');
  });
  it('sport가 비면 기타로 폴백', () => {
    expect(cachePath('몽피스', '', 'roster')).toBe('cache/몽피스/기타/roster/all');
  });
});
