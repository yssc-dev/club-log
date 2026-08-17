import { describe, it, expect } from 'vitest';
import { buildMonthSummary, buildLastMatchDay } from '../tennisDashboard';

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
  it('경기수(game_id+match_id 조합)·경기일 집계', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.matches).toBe(3);
    expect(s.days).toBe(3);
  });
  it('경기수는 game_id+match_id 조합 — 날짜 다른 같은 match_id(R1_C1)를 별개 경기로 센다', () => {
    const reuse = [
      { date: '2026-08-01', game_id: 'g1', match_id: 'R1_C1', player: 'A', result: '승' },
      { date: '2026-08-02', game_id: 'g2', match_id: 'R1_C1', player: 'A', result: '승' },
    ];
    const s = buildMonthSummary({ rows: reuse, month: '2026-08' });
    expect(s.matches).toBe(2); // distinct match_id만 세면 1로 뭉개짐 — game_id로 구분
    expect(s.days).toBe(2);
  });
  it('최다 출전(회원, 게스트 제외)', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.topAttender.name).toBe('박성언');
    expect(s.topAttender.games).toBe(3);
    expect(s.topAttender.wins).toBe(2);
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
    expect(s).toEqual({ month: '2026-01', matches: 0, days: 0, topAttender: null, hotPlayer: null, playerCount: 0 });
  });
  it('빈 rows 안전', () => {
    expect(buildMonthSummary({ rows: [], month: '2026-08' }).matches).toBe(0);
  });
  it('topAttender 동수 — 이름 오름차순 선택', () => {
    const tied = [
      { date: '2026-08-01', match_id: 'x1', player: '홍길동', result: '승' },
      { date: '2026-08-01', match_id: 'x1', player: '가나다', result: '패' },
    ];
    expect(buildMonthSummary({ rows: tied, month: '2026-08' }).topAttender.name).toBe('가나다');
  });
});

describe('buildLastMatchDay', () => {
  it('가장 최근 경기일 + 그날 경기수·회원/용병·다승1위', () => {
    const rows = [
      { date: '2026-08-01', match_id: 'm0', game_id: 'g0', player: '박성언', result: '승' }, // 과거
      { date: '2026-08-17', match_id: 'R1_C1', game_id: 'g1', player: '박성언', result: '승' },
      { date: '2026-08-17', match_id: 'R1_C1', game_id: 'g1', player: '기다빈', result: '패' },
      { date: '2026-08-17', match_id: 'R2_C1', game_id: 'g1', player: '박성언', result: '승' },
      { date: '2026-08-17', match_id: 'R2_C1', game_id: 'g1', player: '두리', result: '패', is_guest: true },
    ];
    const s = buildLastMatchDay({ rows });
    expect(s.date).toBe('2026-08-17');            // 최신 날짜
    expect(s.matches).toBe(2);                    // R1_C1, R2_C1 (과거 m0 제외)
    expect(s.memberCount).toBe(2);                // 박성언, 기다빈 (두리=용병 제외)
    expect(s.guestCount).toBe(1);                 // 두리
    expect(s.topWinner).toMatchObject({ name: '박성언', wins: 2 });
  });
  it('다승 동수 — 이름 오름차순', () => {
    const rows = [
      { date: '2026-08-17', match_id: 'R1_C1', game_id: 'g1', player: '홍길동', result: '승' },
      { date: '2026-08-17', match_id: 'R2_C1', game_id: 'g1', player: '가나다', result: '승' },
    ];
    expect(buildLastMatchDay({ rows }).topWinner.name).toBe('가나다');
  });
  it('기록 없으면 null', () => {
    expect(buildLastMatchDay({ rows: [] })).toBeNull();
    expect(buildLastMatchDay({ rows: [{ player: '갑', result: '승' }] })).toBeNull(); // date 없음
  });
});
