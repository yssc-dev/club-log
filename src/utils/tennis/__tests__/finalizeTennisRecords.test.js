// 마감 전송 성공 후 playerGames 캐시가 재적재되는지 검증한다.
// 봇(매일 10시)과 함께 이 경로가 캐시 신선도의 주 담당이다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refreshed = [];
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: () => Promise.resolve([]),
    refresh: (d) => { refreshed.push(d); return Promise.resolve([]); },
  },
}));

const writes = [];
vi.mock('../../../services/tennisSync', () => ({
  default: {
    writeMatches: (r) => { writes.push(['matches', r]); return Promise.resolve({ success: true }); },
    writePlayerGames: (r) => { writes.push(['pg', r]); return Promise.resolve({ success: true }); },
  },
}));

import { finalizeTennisRecords } from '../finalizeTennisRecords';
import SheetCache from '../../../services/sheetCache';
import TennisSync from '../../../services/tennisSync';

beforeEach(() => {
  refreshed.length = 0;
  writes.length = 0;
  // 아래 두 테스트가 이 목의 메서드를 실패 구현으로 덮어쓰고 복원하지 않으므로,
  // 매 테스트 시작 시 기본(성공) 구현으로 되돌려 테스트 간 격리를 보장한다.
  TennisSync.writePlayerGames = (r) => { writes.push(['pg', r]); return Promise.resolve({ success: true }); };
  SheetCache.refresh = (d) => { refreshed.push(d); return Promise.resolve([]); };
});

describe('finalizeTennisRecords', () => {
  it('전송 성공 후 playerGames 캐시를 재적재한다', async () => {
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(true);
    expect(writes.map(w => w[0])).toEqual(['matches', 'pg']);
    expect(refreshed).toEqual(['playerGames']);
  });

  it('전송이 실패하면 재적재하지 않는다', async () => {
    TennisSync.writePlayerGames = () => Promise.reject(new Error('시트 장애'));
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(false);
    expect(r.failed).toHaveLength(1);
    expect(refreshed).toEqual([]);
  });

  it('재적재가 실패해도 전송 성공을 되돌리지 않는다', async () => {
    SheetCache.refresh = () => Promise.reject(new Error('RTDB down'));
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(true);
  });
});
