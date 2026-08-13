import { describe, it, expect } from 'vitest';
import { calcTrends } from '../calcTrends';
import { calcStreaks } from '../calcStreaks';

// date 없는 행 1개가 트렌드/스트릭 전체를 크래시시키지 않아야 한다.
// 풋살 유일 수정 — 정상 데이터(전 행 date 존재)에선 결과가 수정 전과 동일해야 한다.
describe('date null 정렬 크래시 방어', () => {
  const good = [
    { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
    { player: 'A', date: '2026-01-08', goals: 0, keeper_games: 1, conceded: 0 },
  ];

  it('calcStreaks: date undefined 행이 섞여도 던지지 않는다', () => {
    const rows = [...good, { player: 'A', goals: 2 }]; // date 없음
    expect(() => calcStreaks({ playerName: 'A', playerLogs: rows })).not.toThrow();
  });

  it('calcStreaks: 정상 데이터 결과는 수정 전과 동일', () => {
    const r = calcStreaks({ playerName: 'A', playerLogs: good });
    expect(r.scoringStreak).toEqual({ current: 0, best: 1 });
    expect(r.cleanSheetStreak).toEqual({ current: 1, best: 1 });
  });

  it('calcTrends: date undefined 행이 섞여도 던지지 않는다', () => {
    const rows = [...good, { player: 'A', goals: 2 }];
    expect(() => calcTrends({ playerName: 'A', playerLogs: rows, matchLogs: [] })).not.toThrow();
  });
});
