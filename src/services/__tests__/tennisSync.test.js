import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TennisSync, { stripNameDecorations } from '../tennisSync';

// 이 프로젝트 jsdom 설정은 동작하는 localStorage를 제공하지 않으므로 직접 stub (authUtil.teams.test.js와 동일 패턴)
let _store = {};
const mockLocalStorage = {
  getItem: (k) => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { _store = {}; },
};

function mockFetchOnce(payload, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status, json: async () => payload,
  });
}
function lastBody(fetchMock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

beforeEach(() => {
  _store = {};
  vi.stubGlobal('localStorage', mockLocalStorage);
  mockLocalStorage.setItem('masterfc_auth', JSON.stringify({
    name: '서라현', phone4: '1234', team: '몽피스', mode: '테니스', role: '관리자',
    timestamp: Date.now(),
  }));
  import.meta.env.VITE_APPS_SCRIPT_URL = 'https://example.test/exec';
});
afterEach(() => { _store = {}; vi.restoreAllMocks(); });

describe('stripNameDecorations', () => {
  it('문자열의 ★류 표식을 지운다', () => {
    expect(stripNameDecorations('박성언★')).toBe('박성언');
  });
  it('배열/중첩 객체까지 재귀 적용', () => {
    expect(stripNameDecorations({ rows: [{ player: '김원희⭐', partner: '기다빈' }] }))
      .toEqual({ rows: [{ player: '김원희', partner: '기다빈' }] });
  });
  it('숫자/불리언은 그대로', () => {
    expect(stripNameDecorations({ a: 6, ok: true })).toEqual({ a: 6, ok: true });
  });

  // df5277b 반영 — 참석명단 "정보영 ★" 형태: 별표 앞 공백까지 제거
  it('별표 앞 공백까지 제거한다', () => {
    expect(stripNameDecorations('정보영 ★')).toBe('정보영');
  });

  // + 수량자: 별표가 여러 개 붙은 경우
  it('별표가 여러 개 연속 붙어도 모두 제거한다', () => {
    expect(stripNameDecorations('박성언★★')).toBe('박성언');
  });

  // 조건부 trim 핵심 케이스: 장식 없는 문자열의 공백은 보존
  // 무조건 trim 구현이면 이 케이스가 실패한다
  it('장식이 없는 문자열의 앞뒤 공백은 보존한다', () => {
    expect(stripNameDecorations(' 메모 ')).toBe(' 메모 ');
  });
});

describe('요청 계약', () => {
  it('쓰기 요청에 authToken과 team이 실린다', async () => {
    const f = mockFetchOnce({ success: true, count: 1 });
    global.fetch = f;
    await TennisSync.writeMatches([{ player: 'x' }]);
    const body = lastBody(f);
    expect(body.team).toBe('몽피스');
    expect(body.authToken).toBeTruthy();
    expect(body.action).toBe('writeTennisMatches');
  });

  it('읽기 요청에도 authToken과 team이 실린다', async () => {
    const f = mockFetchOnce({ success: true, players: [] });
    global.fetch = f;
    await TennisSync.getRoster();
    const body = lastBody(f);
    expect(body.team).toBe('몽피스');
    expect(body.authToken).toBeTruthy();
  });

  it('페이로드의 ★가 제거된 채 전송된다', async () => {
    const f = mockFetchOnce({ success: true });
    global.fetch = f;
    await TennisSync.writePlayerGames([{ player: '박성언★', partner: '기다빈' }]);
    expect(lastBody(f).data.rows[0].player).toBe('박성언');
  });
});

describe('실패 변환', () => {
  it('HTTP 200 + success:false 를 throw로 바꾼다', async () => {
    global.fetch = mockFetchOnce({ success: false, error: '잠금 획득 실패' });
    await expect(TennisSync.writeMatches([{}])).rejects.toThrow(/잠금 획득 실패/);
  });

  it('비200도 throw', async () => {
    global.fetch = mockFetchOnce({}, false, 500);
    await expect(TennisSync.writeMatches([{}])).rejects.toThrow(/HTTP 500/);
  });

  it('성공이면 결과를 그대로 돌려준다', async () => {
    global.fetch = mockFetchOnce({ success: true, count: 3 });
    await expect(TennisSync.writeMatches([{}])).resolves.toMatchObject({ count: 3 });
  });

  it('읽기 실패는 throw하지 않고 빈 배열 (화면이 죽지 않게)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    await expect(TennisSync.getRoster()).resolves.toEqual([]);
  });
});
