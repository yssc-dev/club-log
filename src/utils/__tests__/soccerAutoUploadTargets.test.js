import { describe, it, expect } from 'vitest';
import {
  classifySoccerAutoTarget, selectSoccerAutoTargets, kstDateFromGameId, findSheetConflicts,
  ACTION_UPLOAD_ARCHIVE, ACTION_ARCHIVE_ONLY, ACTION_SKIP, SOCCER_SHEET_KEYS,
} from '../soccerAutoUploadTargets';

// 2026-11-10 21:00 KST = 2026-11-10 12:00 UTC
const GID_1110 = `g_${Date.UTC(2026, 10, 10, 12, 0, 0)}`;
// 2026-11-10 23:30 UTC = 2026-11-11 08:30 KST (UTC 날짜와 KST 날짜가 갈리는 경계)
const GID_1111_KST = `g_${Date.UTC(2026, 10, 10, 23, 30, 0)}`;

const finishedMatch = { status: 'finished', matchIdx: 0, events: [] };
const base = (over = {}) => ({
  matchMode: 'soccer', phase: 'summary', gameFinalized: false, tournamentId: '',
  soccerMatches: [finishedMatch], ...over,
});

describe('kstDateFromGameId', () => {
  it('KST 기준 날짜를 낸다 (UTC 날짜와 갈리는 경계 포함)', () => {
    expect(kstDateFromGameId(GID_1110)).toBe('2026-11-10');
    expect(kstDateFromGameId(GID_1111_KST)).toBe('2026-11-11');
  });
  it('형식이 아니면 null', () => {
    expect(kstDateFromGameId('legacy')).toBeNull();
    expect(kstDateFromGameId('g_abc')).toBeNull();
    expect(kstDateFromGameId(undefined)).toBeNull();
  });
});

describe('classifySoccerAutoTarget', () => {
  it('경기마감(summary)·미확정·전날 경기 → 업로드+아카이브', () => {
    expect(classifySoccerAutoTarget(GID_1110, base(), '2026-11-11')).toBe(ACTION_UPLOAD_ARCHIVE);
  });
  it('이미 기록확정한 경기 → 아카이브만', () => {
    expect(classifySoccerAutoTarget(GID_1110, base({ gameFinalized: true }), '2026-11-11')).toBe(ACTION_ARCHIVE_ONLY);
  });
  it('당일 경기는 건드리지 않는다', () => {
    expect(classifySoccerAutoTarget(GID_1110, base(), '2026-11-10')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget(GID_1111_KST, base(), '2026-11-11')).toBe(ACTION_SKIP);
  });
  it('경기마감 전(match/setup)은 건드리지 않는다', () => {
    expect(classifySoccerAutoTarget(GID_1110, base({ phase: 'match' }), '2026-11-11')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget(GID_1110, base({ phase: 'setup' }), '2026-11-11')).toBe(ACTION_SKIP);
  });
  it('축구가 아닌 state·대회 세션·종료 경기 0개·레거시 gameId 는 제외', () => {
    expect(classifySoccerAutoTarget(GID_1110, base({ matchMode: 'schedule' }), '2026-11-11')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget(GID_1110, base({ tournamentId: 'cup1' }), '2026-11-11')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget(GID_1110, base({ soccerMatches: [{ status: 'playing' }] }), '2026-11-11')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget('legacy', base(), '2026-11-11')).toBe(ACTION_SKIP);
    expect(classifySoccerAutoTarget(GID_1110, null, '2026-11-11')).toBe(ACTION_SKIP);
  });
});

describe('selectSoccerAutoTargets', () => {
  it('대상만 남기고 action 을 붙인다', () => {
    const out = selectSoccerAutoTargets([
      { gameId: GID_1110, state: base() },
      { gameId: GID_1110 + '1', state: base({ phase: 'match' }) },
    ], '2026-11-11');
    expect(out.map(g => g.action)).toEqual([ACTION_UPLOAD_ARCHIVE]);
  });
});

describe('findSheetConflicts', () => {
  it('보낸 기록이 없는데 그 날짜 행이 이미 있는 시트만 충돌', () => {
    expect(findSheetConflicts({}, { rawMatches: 6, pointLog: 0 })).toEqual(['rawMatches']);
  });
  it('러너가 보냈다고 기록한 시트는 충돌이 아니다 (재시도 시 이어서 보냄)', () => {
    expect(findSheetConflicts({ pointLog: 1, playerLog: 1 }, { pointLog: 9, playerLog: 20 })).toEqual([]);
  });
  it('전부 비어 있으면 충돌 없음', () => {
    expect(findSheetConflicts(null, {})).toEqual([]);
  });
  it('시트 키는 5종', () => {
    expect(SOCCER_SHEET_KEYS).toHaveLength(5);
  });
});
