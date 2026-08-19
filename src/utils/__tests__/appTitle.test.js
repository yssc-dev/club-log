import { describe, it, expect } from 'vitest';
import { appTitle } from '../appTitle';

describe('appTitle', () => {
  it('팀에 들어가면 "팀이름 - 클럽 기록"', () => {
    expect(appTitle('하버FC')).toBe('하버FC - 클럽 기록');
    expect(appTitle('마스터FC')).toBe('마스터FC - 클럽 기록');
  });

  it('팀 밖(로그인·팀선택)에서는 기본 제목', () => {
    expect(appTitle(null)).toBe('클럽 기록');
    expect(appTitle('')).toBe('클럽 기록');
    expect(appTitle(undefined)).toBe('클럽 기록');
  });

  it('공백뿐인 팀명은 기본 제목 — 빈 접두사를 만들지 않는다', () => {
    expect(appTitle('  ')).toBe('클럽 기록');
  });
});
