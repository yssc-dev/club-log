// src/services/__tests__/finalizedSummary.test.js
// HistoryView 는 summary.split('|') 로 parts[1](작성자)·[3](이벤트)·[4](완료경기)를 읽는다 —
// 6번째 파트를 덧붙여도 앞 5개 인덱스가 그대로여야 한다(스펙 §6.5·§8).
import { describe, it, expect } from 'vitest';
import { buildFinalizedSummary } from '../finalizedSummary';

const parts = (s) => s.split('|').map(x => x.trim());

describe('buildFinalizedSummary', () => {
  it('정규 풋살: 5파트, 🏆 없음', () => {
    const s = buildFinalizedSummary('g_1', { gameCreator: '홍길동', phase: 'summary', allEvents: [{}, {}], completedMatches: [{}] });
    expect(s).toBe('g_1 | 홍길동 | summary | 이벤트 2건 | 완료 1경기');
    expect(parts(s)).toHaveLength(5);
  });
  it('컵 풋살: 앞 5파트 동일 + 6번째 🏆 대회명', () => {
    const s = buildFinalizedSummary('g_1', { gameCreator: '홍길동', phase: 'summary', allEvents: [], completedMatches: [], tournamentId: '마스터스컵 2026' });
    const p = parts(s);
    expect(p.slice(0, 5)).toEqual(['g_1', '홍길동', 'summary', '이벤트 0건', '완료 0경기']);
    expect(p[5]).toBe('🏆 마스터스컵 2026');
  });
  it('대회명의 | 는 전각으로 치환해 split 인덱스를 지킨다', () => {
    const s = buildFinalizedSummary('g_1', { phase: 'x', tournamentId: 'a|b' });
    expect(parts(s)).toHaveLength(6);
    expect(parts(s)[5]).toBe('🏆 a｜b');
  });
  it('축구: soccerMatches 기준 집계(기존 동작 유지)', () => {
    const s = buildFinalizedSummary('s_1', { lastEditor: '김', phase: 'match', soccerMatches: [{ status: 'finished', events: [{}, {}] }, { status: 'playing', events: [] }] });
    expect(s).toBe('s_1 | 김 | match | 이벤트 2건 | 완료 1경기');
  });
  it('테니스: 라운드·완료 코트 요약(기존 동작 유지)', () => {
    const s = buildFinalizedSummary('t_1', { sport: '테니스', gameCreator: '박', phase: 'summary', rounds: [{ courts: [{ status: 'done' }, { status: 'open' }] }] });
    expect(s).toBe('t_1 | 박 | summary | 1라운드 | 완료 1경기');
  });
});
