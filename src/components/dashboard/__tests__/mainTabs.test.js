import { describe, it, expect } from 'vitest';
import { buildMainTabs } from '../mainTabs';

const keys = (arr) => arr.map(t => t.key);

describe('buildMainTabs 테니스', () => {
  it('관리자 = 대시보드·리그·분석·회원관리·경기관리, beta 배지 없음(회원관리 실기능화)', () => {
    const t = buildMainTabs({ activeSport: '테니스', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['tdash', 'league', 'records', 'members', 'games']);
    expect(t.find(x => x.key === 'tdash').beta).toBeFalsy();     // 대시보드 beta 제거됨
    expect(t.find(x => x.key === 'members').beta).toBeFalsy();   // 회원관리 실기능화 → beta 제거
    expect(keys(t)).not.toContain('roster');
  });
  it('비관리자 = 회원관리 없음 (대시보드·리그·분석·경기관리)', () => {
    expect(keys(buildMainTabs({ activeSport: '테니스', role: '멤버', pendingCount: 0 })))
      .toEqual(['tdash', 'league', 'records', 'games']);
  });
  it('진행중 경기 있으면 경기관리 badge', () => {
    const t = buildMainTabs({ activeSport: '테니스', role: '멤버', pendingCount: 2 });
    expect(t.find(x => x.key === 'games').badge).toBe(true);
  });
});

describe('buildMainTabs 비테니스(회귀)', () => {
  it('축구 = records·roster·analytics·games·tournament', () => {
    const t = buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['records', 'roster', 'analytics', 'games', 'tournament']);
    expect(t.every(x => !x.beta)).toBe(true);
    expect(t.find(x => x.key === 'games').badge).toBeFalsy();
  });
  it('풋살 = records·roster·analytics·games (대회 없음)', () => {
    const t = buildMainTabs({ activeSport: '풋살', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['records', 'roster', 'analytics', 'games']);
    expect(t.find(x => x.key === 'records').label).toBe('대시보드');
    expect(t.find(x => x.key === 'roster').label).toBe('개인기록');
    expect(t.every(x => !x.beta)).toBe(true);
    expect(t.find(x => x.key === 'games').badge).toBeFalsy();
  });
  it('축구 roster 라벨=팀/개인 기록', () => {
    const t = buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0 });
    expect(t.find(x => x.key === 'roster').label).toBe('팀/개인 기록');
  });
});

// 스펙 §15: 로그 시트만 쓰는 축구팀(빅마스터FC)은 대회 탭을 숨긴다(대회 생성은 대회_* 탭을 새로 만든다).
describe('buildMainTabs hideTournament', () => {
  it('축구 + hideTournament = 대회 없음, 나머지 순서 그대로', () => {
    const t = buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0, hideTournament: true });
    expect(keys(t)).toEqual(['records', 'roster', 'analytics', 'games']);
  });
  it('기본값(인자 없음)은 기존대로 대회 포함', () => {
    expect(keys(buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0 }))).toContain('tournament');
  });
});
