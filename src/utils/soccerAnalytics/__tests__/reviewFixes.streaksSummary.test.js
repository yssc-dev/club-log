import { describe, it, expect } from 'vitest';
import { calcStreaks } from '../calcStreaks';
import { calcTrends } from '../calcTrends';
import { calcPlayerSummary } from '../calcPlayerSummary';

// 2026-08-12 축구 분석지표 코드 리뷰 픽스 — soccerAnalytics 전용(풋살 원본과 무관)
describe('리뷰픽스: calcStreaks/calcTrends', () => {
  it('#3/#4 date 없는 행이 섞여도 던지지 않는다', () => {
    const rows = [
      { player: 'A', date: '2026-01-01', goals: 1 },
      { player: 'A', date: '2026-01-08', goals: 0 },
      { player: 'A', goals: 2 }, // date 없음 — 정렬 비교자 호출 유도
    ];
    expect(() => calcStreaks({ playerName: 'A', playerLogs: rows })).not.toThrow();
    expect(() => calcTrends({ playerName: 'A', playerLogs: rows, matchLogs: [] })).not.toThrow();
  });

  it('#6 CSV 문자열 conceded "0"도 클린시트로 인정', () => {
    const rows = [
      { player: 'G', date: '2026-01-01', keeper_games: 2, conceded: '0' },
      { player: 'G', date: '2026-01-08', keeper_games: '3', conceded: 0 },
    ];
    expect(calcStreaks({ playerName: 'G', playerLogs: rows }).cleanSheetStreak).toEqual({ current: 2, best: 2 });
  });

  it('#11 문자열 keeper_games "0"은 필드 세션으로 스킵', () => {
    const rows = [
      { player: 'G', date: '2026-01-01', keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-08', keeper_games: '0', conceded: '0' }, // 필드 세션 — 유지돼야 함
      { player: 'G', date: '2026-01-15', keeper_games: 1, conceded: 0 },
    ];
    expect(calcStreaks({ playerName: 'G', playerLogs: rows }).cleanSheetStreak).toEqual({ current: 2, best: 2 });
  });
});

describe('리뷰픽스: calcPlayerSummary', () => {
  it('#1 date null 매치가 totalSessions를 부풀리지 않는다', () => {
    const r = calcPlayerSummary({ matchLogs: [
      { date: '2026-01-01', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 1, opponent_score: 0 },
      { date: null, our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ] });
    expect(r.totalSessions).toBe(1);
  });

  it('#5 is_extra 매치의 골 이벤트는 집계에서 제외', () => {
    const r = calcPlayerSummary({
      matchLogs: [
        { date: '2026-01-01', match_id: 'R1_C1', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 1, opponent_score: 0 },
        { date: '2026-01-01', match_id: 'R2_C1', is_extra: true, our_members_json: '["A"]', opponent_members_json: '[]', our_score: 3, opponent_score: 0 },
      ],
      eventLogs: [
        { event_type: 'goal', player: 'A', date: '2026-01-01', match_id: 'R1_C1' },
        { event_type: 'goal', player: 'A', date: '2026-01-01', match_id: 'R2_C1' }, // 번외 골 — 제외돼야 함
      ],
    });
    expect(r.perPlayer['A'].goals).toBe(1);
  });

  it('#5 match_id 없는 레거시 이벤트는 보수적으로 유지', () => {
    const r = calcPlayerSummary({
      matchLogs: [{ date: '2026-01-01', match_id: 'R1_C1', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 1, opponent_score: 0 }],
      eventLogs: [{ event_type: 'goal', player: 'A', date: '2026-01-01' }], // match_id 없음
    });
    expect(r.perPlayer['A'].goals).toBe(1);
  });
});
