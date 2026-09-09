import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ refreshed: [], sportsSeen: [], fail: new Set() }));

vi.mock('../../services/sheetCache', () => ({
  default: {
    refresh: (d, opts) => {
      h.refreshed.push(d);
      h.sportsSeen.push(opts?.sport);
      if (h.fail.has(d)) return Promise.reject(new Error('boom'));
      return Promise.resolve({ ok: true, rows: [] });
    },
  },
}));

import { refreshAfterFinalize } from '../refreshAfterFinalize';

beforeEach(() => { h.refreshed.length = 0; h.sportsSeen.length = 0; h.fail.clear(); });

describe('refreshAfterFinalize', () => {
  it('요청한 데이터셋을 모두 재적재한다', async () => {
    await refreshAfterFinalize(['matchLog', 'eventLog']);
    expect(h.refreshed.sort()).toEqual(['eventLog', 'matchLog']);
  });

  it('병렬로 실행한다(순차 아님)', async () => {
    await refreshAfterFinalize(['a', 'b', 'c']);
    expect(h.refreshed).toEqual(['a', 'b', 'c']); // 모두 즉시 시작됨
  });

  // 캐시는 파생 데이터다. 재적재가 터져도 마감 성공을 되돌리면 안 된다.
  it('일부가 reject 해도 throw 하지 않는다', async () => {
    h.fail.add('eventLog');
    await expect(refreshAfterFinalize(['matchLog', 'eventLog'])).resolves.toBeUndefined();
  });

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    await refreshAfterFinalize([]);
    expect(h.refreshed).toEqual([]);
  });

  // 겸직팀(한 팀에 풋살·축구 탭 공존)에서는 AuthUtil.mode 가 화면의 종목 토글과
  // 갱신 시점이 다를 수 있다 — 호출부가 넘긴 sport 가 그대로 SheetCache.refresh 에 전달돼야 한다.
  it('sport 오버라이드를 SheetCache.refresh 에 그대로 전달한다', async () => {
    await refreshAfterFinalize(['eventLog', 'playerGameLog'], { sport: '축구' });
    expect(h.sportsSeen).toEqual(['축구', '축구']);
  });

  it('sport 를 생략하면 undefined 로 전달한다(SheetCache 기본값에 위임)', async () => {
    await refreshAfterFinalize(['matchLog']);
    expect(h.sportsSeen).toEqual([undefined]);
  });
});
