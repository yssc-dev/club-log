/**
 * 참석명단 시트 연동 — export CSV(gid) 전환 테스트
 *
 * Case 1: parseAttendanceGrid(gvizFixture) — gviz는 팀관수 열을 통째로 빠뜨림
 * Case 2: parseAttendanceGrid(exportFixture) — export는 4팀 20명을 정상 반환
 * Case 3: resolveSheetGid — 캐시 / 무효화 / force / 비허가 sheetId / miss 기억
 * Case 4: fetchAttendanceCsv — export 우선 / 폴백 시나리오
 * Case 5: fetchAttendanceData — 풋살/축구 end-to-end
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHEET_CONFIG } from '../../config/constants.js';
import {
  parseAttendanceGrid,
  resolveSheetGid,
  invalidateSheetGid,
  fetchAttendanceCsv,
  fetchAttendanceData,
  _resetSheetGidCacheForTests,
} from '../sheetService.js';

const SHEET_ID = SHEET_CONFIG.sheetId;
const SHEET_NAME = '참석명단';
const SHEET_GID = '2005957412';

// vi.hoisted: mock 팩토리가 호이스팅되어 실행되기 전에 참조할 수 있는 가변 상태
const h = vi.hoisted(() => ({
  getSheetListFn: vi.fn(),
  auth: { team: '마스터FC', mode: '풋살' },
  settings: {
    sheetId: '1cM4UhB-nL6smf4OIn_lqQ0on1AtYG2ff_haIXBvXnK0',
    attendanceSheet: '참석명단',
  },
}));

// appSync: default export(AppSync)만 교체, stripNameDecorations는 원본 로직 유지
vi.mock('../appSync', () => {
  const RE = /\s*[★☆✩✪✫✬✭✮✯✰⭐🌟]+/gu;
  function stripNameDecorations(value) {
    if (typeof value === 'string') {
      const stripped = value.replace(RE, '');
      return stripped === value ? value : stripped.trim();
    }
    if (Array.isArray(value)) return value.map(stripNameDecorations);
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = stripNameDecorations(value[k]);
      return out;
    }
    return value;
  }
  return {
    default: { getSheetList: h.getSheetListFn },
    stripNameDecorations,
  };
});

vi.mock('../authUtil', () => ({
  default: { getStored: () => h.auth },
}));

vi.mock('../../config/settings', () => ({
  getSettings: () => h.settings,
}));

// ---- 실제 CSV 페이로드에서 트리밍한 픽스처 ----
// gviz: I열(col 8)이 숫자 열로 판정돼 팀관수 헤더+이름 전부 빈 값으로 내려옴
const GVIZ_FIXTURE = [
  '"전체 명단","","불참 명단","18","","참석 명단","20","팀상운","","팀건호","팀동근","","","","","","","",""',
  '"우상운","","김성환","","","우상운","1번 시드","우상운","","주건호","정동근","","","","","","","",""',
  '"신관수","","김의선","","","신관수","2번 시드","김종현","","서라현","이영문","","","3.06","3.43","3.07","3.11","",""',
  '"노필선","","김민중","","","주건호","3번 시드","김성태","","송대성","우창호","","","3.00","2.92","2.93","2.45","",""',
  '"주건호","","이동규 ★","","","정동근","4번 시드","조승훈 ★","","정보영 ★","차진옥","","","1.88","3.44","6.88","1.43","",""',
  '"정동근","","조경준","","","이영문","5번 시드","나민혁","","김홍익","박재운 ★","","","5.04","1.42","4.33","2.76","",""',
].join('\n');

// export: 4팀 20명 전부 정상
const EXPORT_FIXTURE = [
  '전체 명단,,불참 명단,18,,참석 명단,20,팀상운,팀관수,팀건호,팀동근,,,,,,,,',
  '우상운,,김성환,,,우상운,1번 시드,우상운,신관수,주건호,정동근,,,팀상운,팀관수,팀건호,팀동근,,#REF!',
  '신관수,,김의선,,,신관수,2번 시드,김종현,오희종,서라현,이영문,,,3.06,3.43,3.07,3.11,,',
  '노필선,,김민중,,,주건호,3번 시드,김성태,양병선,송대성,우창호,,,3.00,2.92,2.93,2.45,,',
  '주건호,,이동규 ★,,,정동근,4번 시드,조승훈 ★,김장수,정보영 ★,차진옥,,,1.88,3.44,6.88,1.43,,',
  '정동근,,조경준,,,이영문,5번 시드,나민혁,조재상 ★,김홍익,박재운 ★,,,5.04,1.42,4.33,2.76,,',
].join('\n');

// 축구 참석명단: B열(col 1)에 이름
const SOCCER_FIXTURE = [
  '번호,이름,포지션',
  '1,김철수,FW',
  '2,박영희,MF',
  '3,이민준,DF',
  ',,',
].join('\n');

// 이 프로젝트 jsdom 설정은 동작하는 localStorage를 제공하지 않으므로 직접 stub
let _store = {};
const mockLocalStorage = {
  getItem: (k) => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { _store = {}; },
};

beforeEach(() => {
  _store = {};
  vi.stubGlobal('localStorage', mockLocalStorage);
  _resetSheetGidCacheForTests();
  h.getSheetListFn.mockReset();
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = { sheetId: SHEET_ID, attendanceSheet: SHEET_NAME };
  globalThis.fetch = vi.fn();
});

// ================================================================
// Case 1 — gviz 페이로드: 팀관수 열 누락 재현
// ================================================================
describe('Case 1: parseAttendanceGrid(gvizFixture)', () => {
  it('teamCount === 3 (팀관수 열 누락)', () => {
    expect(parseAttendanceGrid(GVIZ_FIXTURE).teamCount).toBe(3);
  });

  it('prebuiltTeamNames 에 팀관수가 없고 3팀만', () => {
    expect(parseAttendanceGrid(GVIZ_FIXTURE).prebuiltTeamNames).toEqual(['팀상운', '팀건호', '팀동근']);
  });

  it('gapCols === 1 (팀 열 사이에 빈 열 1개)', () => {
    expect(parseAttendanceGrid(GVIZ_FIXTURE).gapCols).toBe(1);
  });

  it('attendees.length === 15', () => {
    expect(parseAttendanceGrid(GVIZ_FIXTURE).attendees.length).toBe(15);
  });

  it('팀관수 멤버가 attendees에 없음', () => {
    const { attendees } = parseAttendanceGrid(GVIZ_FIXTURE);
    for (const name of ['신관수', '오희종', '양병선', '조재상']) {
      expect(attendees).not.toContain(name);
    }
  });
});

// ================================================================
// Case 2 — export 페이로드: 4팀 20명 정상
// ================================================================
describe('Case 2: parseAttendanceGrid(exportFixture)', () => {
  it('teamCount === 4', () => {
    expect(parseAttendanceGrid(EXPORT_FIXTURE).teamCount).toBe(4);
  });

  it('prebuiltTeamNames 4팀 전부 포함', () => {
    expect(parseAttendanceGrid(EXPORT_FIXTURE).prebuiltTeamNames).toEqual(['팀상운', '팀관수', '팀건호', '팀동근']);
  });

  it('gapCols === 0 (팀 열 사이에 빈 열 없음)', () => {
    expect(parseAttendanceGrid(EXPORT_FIXTURE).gapCols).toBe(0);
  });

  it('attendees.length === 20', () => {
    expect(parseAttendanceGrid(EXPORT_FIXTURE).attendees.length).toBe(20);
  });

  it('팀관수 멤버 순서 정확', () => {
    const { prebuiltTeams, prebuiltTeamNames } = parseAttendanceGrid(EXPORT_FIXTURE);
    const idx = prebuiltTeamNames.indexOf('팀관수');
    expect(prebuiltTeams[idx]).toEqual(['신관수', '오희종', '양병선', '김장수', '조재상']);
  });
});

// ================================================================
// Case 3 — resolveSheetGid 캐시 동작
// ================================================================
describe('Case 3: resolveSheetGid', () => {
  it('첫 호출 → getSheetList 1회, gid 반환, localStorage 기록', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }]);
    const gid = await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(gid).toBe(SHEET_GID);
    expect(h.getSheetListFn).toHaveBeenCalledTimes(1);
    const cacheKey = `sheetGid:${SHEET_ID}:${SHEET_NAME}`;
    expect(localStorage.getItem(cacheKey)).toBe(SHEET_GID);
  });

  it('두 번째 호출 → getSheetList 재호출 없음 (메모리 캐시 히트)', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: SHEET_NAME, gid: SHEET_GID }]);
    await resolveSheetGid(SHEET_ID, SHEET_NAME);
    await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(h.getSheetListFn).toHaveBeenCalledTimes(1);
  });

  it('메모리 캐시만 초기화 후 두 번째 호출 → localStorage 에서 읽어 getSheetList 미호출', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }]);
    // 1st call: 메모리+localStorage 양쪽에 기록됨
    await resolveSheetGid(SHEET_ID, SHEET_NAME);
    // 메모리 Map만 초기화 (localStorage 는 유지)
    _resetSheetGidCacheForTests();
    // 2nd call: 메모리 미스 → localStorage 히트 → getSheetList 재호출 없어야 함
    const gid = await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(gid).toBe(SHEET_GID);
    expect(h.getSheetListFn).toHaveBeenCalledTimes(1);
  });

  it('invalidateSheetGid 후 → getSheetList 재호출', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: SHEET_NAME, gid: SHEET_GID }]);
    await resolveSheetGid(SHEET_ID, SHEET_NAME);
    invalidateSheetGid(SHEET_ID, SHEET_NAME);
    await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(h.getSheetListFn).toHaveBeenCalledTimes(2);
  });

  it('force: true → 캐시 무시, getSheetList 재호출', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: SHEET_NAME, gid: SHEET_GID }]);
    await resolveSheetGid(SHEET_ID, SHEET_NAME);          // 캐시에 기록
    await resolveSheetGid(SHEET_ID, SHEET_NAME, { force: true }); // force bypass
    expect(h.getSheetListFn).toHaveBeenCalledTimes(2);
  });

  it('sheetId !== SHEET_CONFIG.sheetId → null, getSheetList 미호출', async () => {
    const gid = await resolveSheetGid('OTHER_SHEET_ID', SHEET_NAME);
    expect(gid).toBeNull();
    expect(h.getSheetListFn).not.toHaveBeenCalled();
  });

  it('이름이 목록에 없음 → null, 두 번째 호출도 getSheetList 미호출', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: '다른시트', gid: '999' }]);
    const gid = await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(gid).toBeNull();
    // 두 번째 호출: miss 가 메모리에 기억되어 getSheetList 재호출 없음
    const gid2 = await resolveSheetGid(SHEET_ID, SHEET_NAME);
    expect(gid2).toBeNull();
    expect(h.getSheetListFn).toHaveBeenCalledTimes(1);
  });
});

// ================================================================
// Case 4 — fetchAttendanceCsv
// ================================================================
describe('Case 4: fetchAttendanceCsv', () => {
  const EXPORT_URL_PART = 'export?format=csv';
  const GVIZ_URL_PART = 'gviz/tq';

  it('(a) gid 해석+export 성공 → fetch 1회(export URL), source===export, gviz 미호출', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }]);
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => EXPORT_FIXTURE });

    const result = await fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME });
    expect(result.source).toBe('export');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain(EXPORT_URL_PART);
    expect(globalThis.fetch.mock.calls[0][0]).not.toContain(GVIZ_URL_PART);
  });

  it('(b) export ok:false → gid 무효화, getSheetList 재호출, 새 gid로 재시도, source===export', async () => {
    h.getSheetListFn
      .mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }])   // 1st call
      .mockResolvedValueOnce([{ name: SHEET_NAME, gid: '999' }]);       // 2nd call (after invalidate)
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '' })     // 1st: fail
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => EXPORT_FIXTURE }); // 2nd: success

    const result = await fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME });
    expect(result.source).toBe('export');
    expect(h.getSheetListFn).toHaveBeenCalledTimes(2);
    // 두 번째 fetch 는 새 gid(999)로 호출
    expect(globalThis.fetch.mock.calls[1][0]).toContain('gid=999');
  });

  it('(c) export ok:true 지만 HTML 응답 → gviz 폴백, source===gviz', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: SHEET_NAME, gid: SHEET_GID }]);
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<!DOCTYPE html><html>' }) // HTML
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => GVIZ_FIXTURE });           // gviz

    const result = await fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME });
    expect(result.source).toBe('gviz');
    // gviz URL 로 fetch 됐는지 확인
    const lastCall = globalThis.fetch.mock.calls.at(-1)[0];
    expect(lastCall).toContain(GVIZ_URL_PART);
  });

  it('(d) getSheetList [] → gviz만 호출', async () => {
    h.getSheetListFn.mockResolvedValueOnce([]);
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => GVIZ_FIXTURE });

    const result = await fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME });
    expect(result.source).toBe('gviz');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain(GVIZ_URL_PART);
  });

  it('(e) getSheetList reject → gviz 폴백, 예외 없음', async () => {
    h.getSheetListFn.mockRejectedValueOnce(new Error('network error'));
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => GVIZ_FIXTURE });

    await expect(fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME })).resolves.toMatchObject({ source: 'gviz' });
  });

  it('(f) export 불가 + gviz ok:false → throws HTTP 500', async () => {
    h.getSheetListFn.mockResolvedValueOnce([]);                                            // gid 없음
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' }); // gviz fail

    await expect(fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME })).rejects.toThrow('HTTP 500');
  });

  it('(g) localStorage.setItem throw → 정상 gid 반환, 예외 없음', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }]);
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => EXPORT_FIXTURE });

    // setItem 이 throw 해도 resolve 에 영향 없음
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage,
      setItem: () => { throw new Error('storage disabled'); },
    });
    const result = await fetchAttendanceCsv({ sheetId: SHEET_ID, attendanceSheet: SHEET_NAME });
    expect(result.source).toBe('export');
    // 테스트 후 정상 stub 복원
    vi.stubGlobal('localStorage', mockLocalStorage);
  });
});

// ================================================================
// Case 5 — fetchAttendanceData end-to-end (풋살/축구)
// ================================================================
describe('Case 5: fetchAttendanceData end-to-end', () => {
  it('풋살 + export 성공 → source===export, 4팀 20명', async () => {
    h.getSheetListFn.mockResolvedValueOnce([{ name: SHEET_NAME, gid: SHEET_GID }]);
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => EXPORT_FIXTURE });

    const data = await fetchAttendanceData();
    expect(data.source).toBe('export');
    expect(data.teamCount).toBe(4);
    expect(data.attendees.length).toBe(20);
    expect(data.gapCols).toBe(0);
  });

  it('풋살 + gviz 폴백 → 3팀, gapCols===1', async () => {
    h.getSheetListFn.mockResolvedValueOnce([]);  // gid 없음 → gviz 폴백
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => GVIZ_FIXTURE });

    const data = await fetchAttendanceData();
    expect(data.source).toBe('gviz');
    expect(data.teamCount).toBe(3);
    expect(data.gapCols).toBe(1);
  });

  it('축구 → B열 이름 목록, source 포함', async () => {
    h.auth = { team: '마스터FC', mode: '축구' };
    h.getSheetListFn.mockResolvedValueOnce([]);  // gviz 폴백
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => SOCCER_FIXTURE });

    const data = await fetchAttendanceData();
    expect(data.attendees).toEqual(['김철수', '박영희', '이민준']);
    expect(data.teamCount).toBe(0);
    expect(data.source).toBe('gviz');
  });
});
