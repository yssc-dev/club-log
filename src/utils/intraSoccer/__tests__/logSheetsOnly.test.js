// 스펙 §15: 빅마스터FC 는 당장 로그_* 3종 + 빅마스터FC 참석명단만 쓴다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isLogSheetsOnly, LOG_SHEET_DATASETS, sendFinalizeWrites } from '../logSheetsOnly';
import { _setCacheForTest } from '../../../config/settings';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('isLogSheetsOnly', () => {
  let _store = {};
  const mockLocalStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { _store = {}; },
  };
  // 저장된 설정이 전혀 없는 상태(첫 접속·RTDB 로드 전) — 모듈 캐시까지 비운다.
  beforeEach(() => {
    _store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    _setCacheForTest({});
  });

  it('저장된 설정이 없어도 빅마스터FC 축구는 프리셋 폴백으로 true', () => {
    expect(isLogSheetsOnly('빅마스터FC', '축구')).toBe(true);
  });
  it('하버FC·마스터FC·테니스 팀은 false', () => {
    expect(isLogSheetsOnly('하버FC', '축구')).toBe(false);
    expect(isLogSheetsOnly('마스터FC', '풋살')).toBe(false);
    expect(isLogSheetsOnly('마스터FC', '축구')).toBe(false);
    expect(isLogSheetsOnly('몽피스', '테니스')).toBe(false);
  });
  it('빅마스터FC 라도 축구가 아니면 false, 팀이 없으면 false', () => {
    expect(isLogSheetsOnly('빅마스터FC', '풋살')).toBe(false);
    expect(isLogSheetsOnly('', '축구')).toBe(false);
    expect(isLogSheetsOnly(undefined, '축구')).toBe(false);
  });
  it('저장된 설정에 자체전축구 프리셋이 있으면 true', () => {
    // masterfc_settings_<team> = settings.js 의 localStorage 키 포맷(_key)
    _store['masterfc_settings_어떤팀'] = JSON.stringify({ 축구: { preset: '자체전축구', overrides: {} } });
    expect(isLogSheetsOnly('어떤팀', '축구')).toBe(true);
  });
});

describe('sendFinalizeWrites', () => {
  const rows = {
    pointLogRows: [{ p: 1 }], playerLogRows: [{ q: 1 }],
    rawEvents: [{ e: 1 }], rawPlayerGames: [{ g: 1 }], matchRows: [{ m: 1 }],
  };
  const settings = { pointLogSheet: '포인트시트', playerLogSheet: '집계시트' };
  const mkAppSync = () => ({
    writeSoccerPointLog: vi.fn(() => Promise.resolve({ success: true, count: 1 })),
    writeSoccerPlayerLog: vi.fn(() => Promise.resolve({ success: true, count: 1 })),
    writeRawEvents: vi.fn(() => Promise.resolve({ count: 1 })),
    writeRawPlayerGames: vi.fn(() => Promise.resolve({ count: 1 })),
    writeMatchLog: vi.fn(() => Promise.resolve({ count: 1 })),
  });

  it('logOnly 면 포인트 로그·선수별집계를 보내지 않고, 결과는 5칸 모양 그대로(앞 둘 = 성공 count 0)', async () => {
    const A = mkAppSync();
    const res = await sendFinalizeWrites(A, rows, settings, { logOnly: true });
    expect(A.writeSoccerPointLog).not.toHaveBeenCalled();
    expect(A.writeSoccerPlayerLog).not.toHaveBeenCalled();
    expect(A.writeRawEvents).toHaveBeenCalledWith({ rows: rows.rawEvents });
    expect(A.writeRawPlayerGames).toHaveBeenCalledWith({ rows: rows.rawPlayerGames });
    expect(A.writeMatchLog).toHaveBeenCalledWith(rows.matchRows);
    expect(res).toHaveLength(5);
    expect(res[0]).toEqual({ status: 'fulfilled', value: { success: true, count: 0 } });
    expect(res[1]).toEqual({ status: 'fulfilled', value: { success: true, count: 0 } });
  });

  it('logOnly 가 아니면 5개 모두 기존 인자 그대로 보낸다', async () => {
    const A = mkAppSync();
    const res = await sendFinalizeWrites(A, rows, settings, { logOnly: false });
    expect(A.writeSoccerPointLog).toHaveBeenCalledWith({ events: rows.pointLogRows }, '포인트시트');
    expect(A.writeSoccerPlayerLog).toHaveBeenCalledWith({ players: rows.playerLogRows }, '집계시트');
    expect(A.writeRawEvents).toHaveBeenCalledWith({ rows: rows.rawEvents });
    expect(A.writeRawPlayerGames).toHaveBeenCalledWith({ rows: rows.rawPlayerGames });
    expect(A.writeMatchLog).toHaveBeenCalledWith(rows.matchRows);
    expect(res.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('로그 쓰기 하나가 실패해도 5칸 모양이 유지돼 호출부가 실패 칸을 가려낼 수 있다', async () => {
    const A = mkAppSync();
    A.writeRawEvents = vi.fn(() => Promise.reject(new Error('boom')));
    const res = await sendFinalizeWrites(A, rows, settings, { logOnly: true });
    expect(res.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  });
});

describe('LOG_SHEET_DATASETS', () => {
  it('로그 3종이고, 각각 sheetCache 에 등록된 데이터셋 키다', () => {
    expect(LOG_SHEET_DATASETS).toEqual(['matchLog', 'eventLog', 'playerGameLog']);
    const src = read('src/services/sheetCache.js');
    for (const k of LOG_SHEET_DATASETS) expect(src).toMatch(new RegExp(`\\b${k}:\\s*\\{`));
  });
});

describe('IntraSoccerApp 정적 불변식(스펙 §15)', () => {
  const src = read('src/IntraSoccerApp.jsx');
  it('포인트 로그·선수별집계 쓰기를 직접 부르지 않고 sendFinalizeWrites 로만 보낸다', () => {
    expect(src).not.toMatch(/AppSync\.writeSoccerPointLog\(/);
    expect(src).not.toMatch(/AppSync\.writeSoccerPlayerLog\(/);
    // 호출 여부만이 아니라 런타임 변수 logOnly 를 넘기는지(하드코딩 { logOnly: false } 회귀 방지).
    expect(src).toMatch(/sendFinalizeWrites\([\s\S]*?\{\s*logOnly\s*\}\s*\)/);
  });
  it('대시보드 읽기(fetchSheetData)는 전부 logOnly 로 가드된다', () => {
    const calls = src.match(/fetchSheetData\(\)/g) || [];
    const guarded = src.match(/logOnly \? Promise\.resolve\(null\) : fetchSheetData\(\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(calls.length);
  });
  it('Apps Script 레거시 경기상태 시트(clearState)도 logOnly 면 건드리지 않는다', () => {
    const calls = src.match(/AppSync\.clearState\(/g) || [];
    const guarded = src.match(/if \(!logOnly\) await AppSync\.clearState\(/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(calls.length);
  });
});
