import { describe, it, expect } from 'vitest';
import { calcRecentForm } from '../calcRecentForm';

// 폼 비교: 마지막 세션 날짜 기준 최근 windowDays(기본 30일) vs 그 이전 전체.
// 오늘 날짜(Date.now)가 아니라 데이터의 마지막 세션 기준 — 휴식기 뒤 빈 카드 방지 + 테스트 결정성.
const M = (date, home, away, ourScore, oppScore, id = 'R1_C1') => ({
  date, match_id: id,
  our_members_json: JSON.stringify(home), opponent_members_json: JSON.stringify(away),
  our_score: ourScore, opponent_score: oppScore,
});

describe('calcRecentForm', () => {
  it('마지막 세션 기준 최근 30일과 그 이전을 나눠 경기수/골/어시/승률 집계 (양 사이드 출전 포함)', () => {
    const matchLogs = [
      M('2026-05-01', ['A', 'B'], ['C', 'D'], 2, 0),            // 평소: A(our) 승
      M('2026-05-01', ['A', 'B'], ['C', 'D'], 0, 1, 'R2_C1'),   // 평소: A(our) 패
      M('2026-08-10', ['B', 'D'], ['C', 'A'], 0, 2),            // 최근: A(away) 승
      M('2026-08-20', ['A', 'D'], ['B', 'C'], 3, 0),            // 최근: A(our) 승 — 앵커
    ];
    const playerLogs = [
      { player: 'A', date: '2026-05-01', goals: 2, assists: 1 },
      { player: 'A', date: '2026-08-10', goals: 0, assists: 0 },
      { player: 'A', date: '2026-08-20', goals: 1, assists: 1 },
    ];
    const r = calcRecentForm({ playerName: 'A', playerLogs, matchLogs });
    expect(r.anchorDate).toBe('2026-08-20');
    expect(r.cutoff).toBe('2026-07-21'); // 앵커 − 30일
    expect(r.baseline).toMatchObject({ rounds: 2, sessions: 1, goals: 2, assists: 1 });
    expect(r.recent).toMatchObject({ rounds: 2, sessions: 2, goals: 1, assists: 1 });
    expect(r.baseline.winRate).toBeCloseTo(0.5);   // 1승 1패
    expect(r.recent.winRate).toBeCloseTo(1.0);     // 2승 (어웨이 승 포함)
    expect(r.baseline.gaPerGame).toBeCloseTo(1.5); // (2+1)/2
    expect(r.recent.gaPerGame).toBeCloseTo(1.0);   // (1+1)/2
  });

  it('휴식(absent) 매치는 출전으로 세지 않고, is_extra 매치는 제외', () => {
    const matchLogs = [
      M('2026-05-01', ['A', 'B'], ['C', 'D'], 1, 0),
      { date: '2026-08-20', match_id: 'R1_C1', our_members_json: JSON.stringify({ players: ['A', 'B'], absent: ['A'] }), opponent_members_json: '["C","D"]', our_score: 5, opponent_score: 0 },
      M('2026-08-20', ['A', 'B'], ['C', 'D'], 1, 0, 'R2_C1'),
      { ...M('2026-08-20', ['A', 'B'], ['C', 'D'], 9, 0, 'R3_C1'), is_extra: true },
    ];
    const r = calcRecentForm({ playerName: 'A', playerLogs: [], matchLogs });
    expect(r.recent.rounds).toBe(1);
    expect(r.recent.winRate).toBeCloseTo(1.0);
  });

  it('매치가 없으면 null, 본인 출전이 전혀 없어도 null', () => {
    expect(calcRecentForm({ playerName: 'A', playerLogs: [], matchLogs: [] })).toBe(null);
    expect(calcRecentForm({ playerName: 'A', playerLogs: [], matchLogs: [M('2026-08-20', ['B'], ['C'], 1, 0)] })).toBe(null);
  });
});
