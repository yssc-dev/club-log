import { describe, it, expect } from 'vitest';
import {
  RECENT_WINDOW_DAYS, shiftDays, latestLogDate, recentCutoff, filterLogsByPeriod,
} from '../analyticsPeriod';

const row = (date, extra = {}) => ({ date, ...extra });

describe('shiftDays', () => {
  it('UTC 기준으로 일수를 더하고 뺀다 — 월 경계를 넘는다', () => {
    expect(shiftDays('2026-09-03', -30)).toBe('2026-08-04');
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('latestLogDate', () => {
  it('세 배열을 통틀어 가장 늦은 날짜를 고른다', () => {
    expect(latestLogDate(
      [row('2026-08-06')],
      [row('2026-09-03')],
      [row('2026-08-27')],
    )).toBe('2026-09-03');
  });

  it('한 배열만 갱신이 늦어도 나머지 기준으로 잡힌다', () => {
    // 실제 사례: 로그_이벤트만 최신 세션이 안 올라온 구간
    expect(latestLogDate([row('2026-09-03')], [row('2026-08-06')], [])).toBe('2026-09-03');
  });

  it('빈 입력·날짜 없는 행은 무시하고 빈 문자열', () => {
    expect(latestLogDate([], null, undefined)).toBe('');
    expect(latestLogDate([{ player: 'A' }, row(''), row('짧음')])).toBe('');
  });
});

describe('filterLogsByPeriod', () => {
  const logs = {
    matchLogs:      [row('2026-08-03'), row('2026-08-04'), row('2026-09-03')],
    eventLogs:      [row('2026-08-03'), row('2026-08-05')],
    playerGameLogs: [row('2026-07-01'), row('2026-09-03')],
  };

  it("period가 'all'이면 입력 객체를 그대로 돌려준다 — 참조까지 동일", () => {
    // 누적 화면이 지금과 완전히 같아야 한다는 제약을 참조 동일성으로 고정한다.
    expect(filterLogsByPeriod(logs, 'all')).toBe(logs);
    expect(filterLogsByPeriod(logs, undefined)).toBe(logs);
  });

  it('창은 [anchor-30일, anchor] 양끝 포함 — calcRecentHotStreak과 같은 규약', () => {
    // anchor=2026-09-03 → cutoff=2026-08-04. 08-04는 들어오고 08-03은 잘린다.
    const out = filterLogsByPeriod(logs, 'recent');
    expect(out.matchLogs.map(r => r.date)).toEqual(['2026-08-04', '2026-09-03']);
    expect(out.eventLogs.map(r => r.date)).toEqual(['2026-08-05']);
    expect(out.playerGameLogs.map(r => r.date)).toEqual(['2026-09-03']);
  });

  it('anchor는 오늘이 아니라 로그의 마지막 날짜 — 휴식기에도 창이 비지 않는다', () => {
    const old = {
      matchLogs: [row('2025-01-05'), row('2025-02-01')],
      eventLogs: [], playerGameLogs: [],
    };
    const out = filterLogsByPeriod(old, 'recent');
    expect(out.matchLogs.map(r => r.date)).toEqual(['2025-01-05', '2025-02-01']);
  });

  it('유효한 날짜가 하나도 없으면 필터를 건너뛴다', () => {
    const noDate = { matchLogs: [{ player: 'A' }], eventLogs: [], playerGameLogs: [] };
    expect(filterLogsByPeriod(noDate, 'recent')).toBe(noDate);
  });

  it('날짜 없는 행은 recent에서 제외된다', () => {
    const mixed = {
      matchLogs: [row('2026-09-03'), { player: 'A' }, row('')],
      eventLogs: [], playerGameLogs: [],
    };
    expect(filterLogsByPeriod(mixed, 'recent').matchLogs).toEqual([row('2026-09-03')]);
  });

  it('빈/누락 배열에도 터지지 않는다', () => {
    const out = filterLogsByPeriod({ matchLogs: [row('2026-09-03')] }, 'recent');
    expect(out.eventLogs).toEqual([]);
    expect(out.playerGameLogs).toEqual([]);
  });
});

describe('recentCutoff', () => {
  it('RECENT_WINDOW_DAYS만큼 뺀 날짜 — 상수와 계산이 어긋나지 않는다', () => {
    const logs = { matchLogs: [row('2026-09-03')], eventLogs: [], playerGameLogs: [] };
    expect(recentCutoff(logs)).toBe(shiftDays('2026-09-03', -RECENT_WINDOW_DAYS));
  });

  it('기준일이 없으면 null', () => {
    expect(recentCutoff({ matchLogs: [], eventLogs: [], playerGameLogs: [] })).toBeNull();
  });
});
