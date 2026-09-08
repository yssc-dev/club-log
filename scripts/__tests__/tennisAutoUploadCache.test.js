// 봇의 캐시 재적재는 순수 로직만 검증한다(러너 전체 실행은 운영 데이터를 건드린다).
import { describe, it, expect } from 'vitest';
import { cachePath } from '../../src/services/rtdbPath.js';
import { encodeRows } from '../../src/services/sheetCacheCore.js';
import { TENNIS_PLAYER_GAME_COLUMNS } from '../../src/utils/tennis/tennisSchema.js';

describe('봇이 쓰는 캐시 노드', () => {
  it('앱과 같은 경로를 만든다', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames'))
      .toBe('cache/몽피스/테니스/playerGames/all');
  });

  it('앱과 같은 배열형 페이로드를 만든다', () => {
    const rows = [{ team: '몽피스', sport: '테니스', player: '박성언' }];
    const node = encodeRows(TENNIS_PLAYER_GAME_COLUMNS, rows);
    expect(node.headers).toEqual(TENNIS_PLAYER_GAME_COLUMNS);
    expect(node.count).toBe(1);
    expect(node.rows[0][TENNIS_PLAYER_GAME_COLUMNS.indexOf('player')]).toBe('박성언');
    // 빠진 컬럼은 '' — RTDB 가 배열 원소의 null 을 드롭해 인덱스가 밀리는 것을 막는다
    expect(node.rows[0]).not.toContain(null);
    expect(node.rows[0]).not.toContain(undefined);
  });
});
