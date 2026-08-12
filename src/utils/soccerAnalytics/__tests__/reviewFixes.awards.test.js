import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';
import { calcDailyMvp } from '../calcDailyMvp';
import { calcVolatility } from '../calcVolatility';

// 2026-08-12 축구 분석지표 코드 리뷰 픽스 — soccerAnalytics 전용(풋살 원본과 무관)
describe('리뷰픽스: calcAwards', () => {
  it('#8 날짜·매치ID 둘 다 없는 골은 해트트릭 집계 제외', () => {
    const eventLogs = [1, 2, 3].map(() => ({ event_type: 'goal', player: 'A' }));
    const r = calcAwards({ playerLogs: [], eventLogs });
    expect(r.hatTricks).toEqual([]);
  });

  it('#13 공백 포함 이름도 해트트릭이 온전한 이름으로 귀속', () => {
    const eventLogs = [1, 2, 3].map(() => ({ event_type: 'goal', player: '박 준태', date: '2026-01-01', match_id: 'R1_C1' }));
    const r = calcAwards({ playerLogs: [], eventLogs });
    expect(r.hatTricks).toEqual([{ player: '박 준태', count: 1 }]);
  });

  it('#15 이벤트 미커버 날짜의 playerLogs 자책도 합산', () => {
    const r = calcAwards({
      playerLogs: [{ player: 'B', date: '2026-01-01', owngoals: 2 }], // 이벤트 로그 밖 날짜
      eventLogs: [{ event_type: 'owngoal', player: 'B', date: '2026-03-01', match_id: 'R1_C1' }],
    });
    expect(r.owngoalKings).toEqual([{ player: 'B', total: 3 }]);
  });

  it('#15 이벤트가 커버하는 날짜는 이벤트가 권위(중복 합산 금지)', () => {
    const r = calcAwards({
      playerLogs: [{ player: 'B', date: '2026-03-01', owngoals: 1 }], // 같은 날짜 — 이벤트 우선
      eventLogs: [{ event_type: 'owngoal', player: 'B', date: '2026-03-01', match_id: 'R1_C1' }],
    });
    expect(r.owngoalKings).toEqual([{ player: 'B', total: 1 }]);
  });
});

describe('리뷰픽스: calcDailyMvp (축구 게이트)', () => {
  it('#2 크로바·고구마·랭크점수 없이 골만 있어도 MVP가 나온다', () => {
    const r = calcDailyMvp({ playerGameLogs: [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 0, cleansheets: 0, crova: 0, goguma: 0, rank_score: 0 },
      { player: 'B', date: '2026-01-01', goals: 0, assists: 1, cleansheets: 0, crova: 0, goguma: 0, rank_score: 0 },
    ] });
    expect(r.recent).toEqual([{ date: '2026-01-01', mvps: ['A'], points: 2 }]);
  });

  it('#9 전원 0포인트인 날은 스킵(전원 공동 MVP 금지)', () => {
    const r = calcDailyMvp({ playerGameLogs: [
      { player: 'A', date: '2026-01-01', goals: 0, rank_score: 3 },
      { player: 'B', date: '2026-01-01', goals: 0, rank_score: 1 },
    ] });
    expect(r.recent).toEqual([]);
    expect(r.eligibleDates).toBe(0);
  });
});

describe('리뷰픽스: calcVolatility', () => {
  it('#12 같은 선수가 몰빵형·꾸준형에 동시 선정되지 않는다', () => {
    const playerLogs = [];
    for (const p of ['A', 'B', 'C']) {
      for (let i = 1; i <= 5; i++) playerLogs.push({ player: p, date: `2026-01-0${i}`, goals: i % 2, assists: 0 });
    }
    const r = calcVolatility({ playerLogs, minGames: 3, topN: 3 });
    const overlap = r.streaky.map(s => s.player).filter(p => r.consistent.some(c => c.player === p));
    expect(overlap).toEqual([]);
  });
});
