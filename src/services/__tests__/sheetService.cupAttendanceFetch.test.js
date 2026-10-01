// src/services/__tests__/sheetService.cupAttendanceFetch.test.js
// 컵 참석 시트 fetch — 탭이 없으면 gviz 가 첫 번째 시트(대시보드)를 돌려주므로 절대 폴백하지 않고 명시적으로 실패한다.
// 2026-10-01 실측: '컵참석' 탭이 없는 상태에서 gviz sheet=컵참석 → 대시보드 CSV 가 내려왔다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SHEET_CONFIG } from '../../config/constants.js';
import { fetchCupAttendanceData, _resetSheetGidCacheForTests } from '../sheetService.js';

const SHEET_ID = SHEET_CONFIG.sheetId;

const h = vi.hoisted(() => ({
  getSheetListFn: vi.fn(),
  auth: { team: '마스터FC', mode: '풋살' },
  settings: {},
}));
vi.mock('../appSync', () => ({
  default: { getSheetList: h.getSheetListFn },
  stripNameDecorations: (v) => (typeof v === 'string' ? v.replace(/\s*[★☆]+/g, '').trim() : v),
}));
vi.mock('../authUtil', () => ({ default: { getStored: () => h.auth } }));
vi.mock('../../config/settings', () => ({ getSettings: () => h.settings }));

let _store = {};
const mockLocalStorage = { getItem: (k) => _store[k] ?? null, setItem: (k, v) => { _store[k] = String(v); }, removeItem: (k) => { delete _store[k]; }, clear: () => { _store = {}; } };

const CSV = ['팀광땡,팀리즈', '최성광,조정', '강민석,'].join('\n');

beforeEach(() => {
  _store = {};
  vi.stubGlobal('localStorage', mockLocalStorage);
  _resetSheetGidCacheForTests();
  h.getSheetListFn.mockReset();
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = { sheetId: SHEET_ID, cupAttendanceSheet: '컵참석' };
});

describe('fetchCupAttendanceData', () => {
  it('탭이 시트 목록에 없으면 gviz 로 폴백하지 않고 "탭이 없습니다" 로 실패한다', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: '참석명단', gid: 1 }, { name: '마스터FC 대시보드', gid: 2 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchCupAttendanceData()).rejects.toThrow(/'컵참석' 탭이 없습니다/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('탭이 있으면 export CSV(gid) 로만 읽고 열을 파싱한다', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: '컵참석', gid: 777 }]);
    const fetchMock = vi.fn(async (url) => ({ ok: true, text: async () => (String(url).includes('gid=777') ? CSV : '<html>') }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchCupAttendanceData();
    expect(r.sheetName).toBe('컵참석');
    expect(r.source).toBe('export');
    expect(r.columns).toEqual([{ header: '팀광땡', names: ['최성광', '강민석'] }, { header: '팀리즈', names: ['조정'] }]);
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('export?format=csv') && String(u).includes('gid=777'))).toBe(true);
  });
  it('export 가 HTML 을 돌려주면(권한·삭제) gviz 폴백 없이 실패한다', async () => {
    h.getSheetListFn.mockResolvedValue([{ name: '컵참석', gid: 777 }]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '<html>login</html>' })));
    await expect(fetchCupAttendanceData()).rejects.toThrow(/읽지 못했습니다/);
  });
  it('시트 목록 조회가 실패하면 탭 존재를 확인할 수 없으므로 실패한다(엉뚱한 시트 읽기 방지)', async () => {
    h.getSheetListFn.mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchCupAttendanceData()).rejects.toThrow(/'컵참석' 탭이 없습니다|확인할 수 없습니다/);
  });
  it('탭 이름 설정이 비어 있으면 안내와 함께 실패', async () => {
    h.settings = { sheetId: SHEET_ID, cupAttendanceSheet: '' };
    await expect(fetchCupAttendanceData()).rejects.toThrow(/컵 참석 시트 미설정/);
  });
});
