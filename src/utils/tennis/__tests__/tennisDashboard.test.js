import { describe, it, expect } from 'vitest';
import { buildMonthSummary } from '../tennisDashboard';

const rows = [
  // 2026-08: match m1 (박·김 복식), m2 (박·이 복식)
  { date: '2026-08-01', match_id: 'm1', player: '박성언', result: '승' },
  { date: '2026-08-01', match_id: 'm1', player: '김원희', result: '승' },
  { date: '2026-08-02', match_id: 'm2', player: '박성언', result: '패' },
  { date: '2026-08-02', match_id: 'm2', player: '이승환', result: '패' },
  { date: '2026-08-03', match_id: 'm3', player: '박성언', result: '승' },
  { date: '2026-08-03', match_id: 'm3', player: '용병A', result: '승', is_guest: true },
  // 2026-07: 다른 달 (제외돼야)
  { date: '2026-07-10', match_id: 'm0', player: '박성언', result: '승' },
];

describe('buildMonthSummary', () => {
  it('이달 distinct match_id로 경기수 집계', () => {
    expect(buildMonthSummary({ rows, month: '2026-08' }).matches).toBe(3);
  });
  it('최다 출전(회원, 게스트 제외)', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.topAttender.name).toBe('박성언');
    expect(s.topAttender.games).toBe(3);
  });
  it('게스트는 회원 집계에서 제외', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.playerCount).toBe(3); // 박성언·김원희·이승환 (용병A 제외)
  });
  it('핫플레이어는 최소 3경기 — 미달이면 null', () => {
    // 박성언만 3경기(2승1패), 나머지 1경기 → 3경기 이상은 박성언뿐
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.hotPlayer.name).toBe('박성언');
    expect(s.hotPlayer.rate).toBeCloseTo(2 / 3);
  });
  it('해당 월 데이터 없으면 matches 0, null들', () => {
    const s = buildMonthSummary({ rows, month: '2026-01' });
    expect(s).toEqual({ month: '2026-01', matches: 0, topAttender: null, hotPlayer: null, playerCount: 0 });
  });
  it('빈 rows 안전', () => {
    expect(buildMonthSummary({ rows: [], month: '2026-08' }).matches).toBe(0);
  });
});
