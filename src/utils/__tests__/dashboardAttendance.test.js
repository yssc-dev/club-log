import { describe, it, expect } from 'vitest';
import { buildAttendanceData, buildAttendanceView } from '../dashboardAttendance';

describe('buildAttendanceData', () => {
  it('같은 날짜 여러 행(하루 다경기)을 유니크 날짜로 센다', () => {
    const plog = [
      { date: '2026-01-06', name: '주건호' },
      { date: '2026-01-06', name: '주건호' },
      { date: '2026-01-13', name: '주건호' },
      { date: '2026-01-06', name: '김형욱' },
    ];
    expect(buildAttendanceData(plog)).toEqual({
      totalDates: 2,
      playerDates: { '주건호': 2, '김형욱': 1 },
    });
  });

  it('빈/무효 입력은 null', () => {
    expect(buildAttendanceData([])).toBeNull();
    expect(buildAttendanceData(null)).toBeNull();
    expect(buildAttendanceData(undefined)).toBeNull();
    expect(buildAttendanceData([{ date: '', name: '' }])).toBeNull();
  });
});

describe('buildAttendanceView', () => {
  const members = [
    { name: '주건호', games: 99 },
    { name: '김형욱', games: 93 },
    { name: '무출전', games: 0 },
  ];

  it('축구 + 데이터 없음 → empty (경기수를 일로 표기하는 폴백 금지)', () => {
    const av = buildAttendanceView('축구', null, members, 99);
    expect(av.mode).toBe('empty');
    expect(av.list).toEqual([]);
  });

  it('축구 + 데이터 → 날짜 기반 내림차순', () => {
    const av = buildAttendanceView('축구',
      { totalDates: 40, playerDates: { '김형욱': 35, '주건호': 38 } }, members, 99);
    expect(av.mode).toBe('dates');
    expect(av.totalDates).toBe(40);
    expect(av.list).toEqual([{ name: '주건호', att: 38 }, { name: '김형욱', att: 35 }]);
  });

  it('풋살 → 기존 경기수 기반 유지, games=0 제외', () => {
    const av = buildAttendanceView('풋살', null, members, 99);
    expect(av.mode).toBe('games');
    expect(av.totalDates).toBe(99);
    expect(av.list).toEqual([{ name: '주건호', att: 99 }, { name: '김형욱', att: 93 }]);
  });

  it('TOP 10으로 자른다 (양쪽 모드)', () => {
    const manyDates = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, 12 - i]));
    expect(buildAttendanceView('축구', { totalDates: 20, playerDates: manyDates }, [], 1).list).toHaveLength(10);
    const manyMembers = Array.from({ length: 12 }, (_, i) => ({ name: `m${i}`, games: 12 - i }));
    expect(buildAttendanceView('풋살', null, manyMembers, 12).list).toHaveLength(10);
  });
});
