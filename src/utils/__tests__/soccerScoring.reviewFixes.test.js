import { describe, it, expect } from 'vitest';
import { calcSoccerPlayerStats, buildEventLogRows } from '../soccerScoring';

// 2026-08-12 축구 분석지표 코드 리뷰 픽스 #7/#10/#14
describe('리뷰픽스: soccerScoring', () => {
  it('#14 soccerMatches undefined에 빈 결과(크래시 금지)', () => {
    expect(calcSoccerPlayerStats(undefined)).toEqual({});
  });

  it('#10 startedAt 없으면 inputTime 빈 문자열(Invalid Date 시트 기록 금지)', () => {
    const rows = buildEventLogRows([
      { status: 'finished', matchIdx: 0, opponent: '한울', lineup: ['A'], gk: 'A', defenders: [], events: [] },
    ], '2026-01-01');
    expect(rows[0].event).toBe('출전');
    expect(rows[0].inputTime).toBe('');
  });

  it('#7 timestamp 없는 이벤트도 결정적 순서(맨 앞)로 정렬 + inputTime 빈 문자열', () => {
    const rows = buildEventLogRows([
      { status: 'finished', matchIdx: 0, opponent: '한울', lineup: [], gk: '', defenders: [], startedAt: 1e12,
        events: [
          { type: 'goal', player: 'B', timestamp: 1e12 + 5000 },
          { type: 'goal', player: 'A' }, // timestamp 없음
        ] },
    ], '2026-01-01');
    const goals = rows.filter(r => r.event === '골');
    expect(goals.map(r => r.player)).toEqual(['A', 'B']); // 무timestamp → 0 취급, 항상 앞
    expect(goals[0].inputTime).toBe('');
  });
});
