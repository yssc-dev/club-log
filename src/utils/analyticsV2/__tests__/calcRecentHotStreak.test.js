import { describe, it, expect } from 'vitest';
import { calcRecentHotStreak } from '../calcRecentHotStreak';

// 풋살 PG 1행 = 1세션. 분모는 행 수(= 대시보드 GAME 열과 같은 척도).
const pg = (date, player, o = {}) => ({
  date, player,
  goals: 0, assists: 0, cleansheets: 0, crova: 0, goguma: 0, owngoals: 0, games: 0,
  ...o,
});

describe('calcRecentHotStreak (풋살)', () => {
  it('기록이 없으면 null', () => {
    expect(calcRecentHotStreak({ playerLogs: [] })).toBeNull();
    expect(calcRecentHotStreak({ playerLogs: [{ player: 'A' }] })).toBeNull();
  });

  it('기준일은 오늘이 아니라 PG 마지막 날짜, 창은 기준일 -30일', () => {
    const r = calcRecentHotStreak({
      playerLogs: [
        pg('2026-08-20', 'A', { goals: 1 }), pg('2026-08-13', 'A', { goals: 1 }),
        pg('2026-08-20', 'B', { goals: 1 }), pg('2026-08-13', 'B', { goals: 1 }),
      ],
    });
    expect(r.anchor).toBe('2026-08-20');
    expect(r.cutoff).toBe('2026-07-21');
    expect(r.sessions).toBe(2); // 창 내 클럽 전체 세션(날짜) 수
  });

  it('창 경계는 cutoff 당일 포함, 하루 전은 평소로', () => {
    const logs = [
      pg('2026-08-20', 'A', { goals: 3 }),
      pg('2026-07-21', 'A', { goals: 3 }), // cutoff 당일 = 최근
      pg('2026-07-20', 'A', { goals: 99 }), // cutoff 하루 전 = 평소
      pg('2026-07-19', 'A', { goals: 99 }),
      pg('2026-07-18', 'A', { goals: 99 }),
      pg('2026-08-20', 'B', { goals: 1 }), pg('2026-07-21', 'B', { goals: 1 }),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    const a = r.rows.find(x => x.player === 'A');
    expect(a.games).toBe(2);
    expect(a.points).toBe(6);
    expect(a.baseGames).toBe(3);
    expect(a.basePoints).toBe(297);
  });

  it('진입선은 창 내 최대 세션수의 30%(하한 2) — 1세션 폭발은 제외', () => {
    const logs = [
      ...['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, '꾸준', { goals: 2 })),
      pg('2026-08-20', '한방', { goals: 20 }), // ppg 20이지만 1세션
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    expect(r.minGames).toBe(2); // ceil(4 * 0.3) = 2
    expect(r.rows.map(x => x.player)).toEqual(['꾸준']);
  });

  it('창 내 세션이 1개뿐이면 통과자가 없어 null (하한 2)', () => {
    const r = calcRecentHotStreak({
      playerLogs: [pg('2026-08-20', 'A', { goals: 5 }), pg('2026-08-20', 'B', { goals: 3 })],
    });
    expect(r).toBeNull();
  });

  it('경기당 포인트 내림차순 TOP3', () => {
    const four = (name, goals) =>
      ['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, name, { goals }));
    const r = calcRecentHotStreak({
      playerLogs: [...four('1위', 5), ...four('2위', 4), ...four('3위', 3), ...four('4위', 2)],
    });
    expect(r.rows.map(x => x.player)).toEqual(['1위', '2위', '3위']);
    expect(r.rows[0].ppg).toBe(5);
  });

  it('포인트 통화 = 골+어시+클린시트+크로바+고구마+역주행감점', () => {
    const logs = [
      pg('2026-08-20', 'A', { goals: 2, assists: 1, cleansheets: 1, crova: 2, goguma: -1, owngoals: 1 }),
      pg('2026-08-13', 'A', { goals: 0 }),
      pg('2026-08-20', 'B'), pg('2026-08-13', 'B'),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    const a = r.rows.find(x => x.player === 'A');
    // 2 + 1 + 1 + 2 + (-1) + (-2) = 3
    expect(a.points).toBe(3);
    expect(a.owngoalPts).toBe(-2);
  });

  it('역주행이 이미 음수(포인트)로 들어오면 그대로 감점', () => {
    const logs = [
      pg('2026-08-20', 'A', { goals: 5, owngoals: -2 }), pg('2026-08-13', 'A'),
      pg('2026-08-20', 'B'), pg('2026-08-13', 'B'),
    ];
    const a = calcRecentHotStreak({ playerLogs: logs }).rows.find(x => x.player === 'A');
    expect(a.points).toBe(3);
  });

  it('평소 표본이 3세션 미만이면 Δ를 내지 않는다', () => {
    const logs = [
      ...['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, '신입', { goals: 3 })),
      pg('2026-06-01', '신입', { goals: 1 }),
      ...['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, '고참', { goals: 2 })),
      ...['2026-06-01', '2026-06-08', '2026-06-15'].map(d => pg(d, '고참', { goals: 1 })),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    const rookie = r.rows.find(x => x.player === '신입');
    const vet = r.rows.find(x => x.player === '고참');
    expect(rookie.hasBaseline).toBe(false);
    expect(rookie.delta).toBeNull();
    expect(rookie.basePpg).toBeNull();
    expect(vet.hasBaseline).toBe(true);
    expect(vet.basePpg).toBe(1);
    expect(vet.delta).toBe(1);
  });

  it('재마감 중복 행이 있어도 경기당 포인트는 흔들리지 않는다', () => {
    const clean = ['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, 'A', { goals: 3 }));
    const others = ['2026-07-30', '2026-08-06'].map(d => pg(d, 'B', { goals: 1 }));
    const base = calcRecentHotStreak({ playerLogs: [...clean, ...others] });
    const dup = calcRecentHotStreak({ playerLogs: [...clean, clean[3], ...others] });
    expect(base.rows[0].ppg).toBe(3);
    expect(dup.rows[0].ppg).toBe(3); // 분자·분모 동반 증가
    expect(dup.rows[0].games).toBe(5);
  });

  it('세션 수는 중복 행과 무관하게 날짜 기준', () => {
    const logs = [
      ...['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'].map(d => pg(d, 'A', { goals: 1 })),
      pg('2026-08-20', 'A', { goals: 1 }),
      ...['2026-07-30', '2026-08-06'].map(d => pg(d, 'B', { goals: 1 })),
    ];
    const a = calcRecentHotStreak({ playerLogs: logs }).rows.find(x => x.player === 'A');
    expect(a.sessions).toBe(4);
    expect(a.games).toBe(5);
  });
});
