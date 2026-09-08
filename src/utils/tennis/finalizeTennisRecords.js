// 마감 전송 + 캐시 재적재. TennisApp.handleSubmitRecords 에서 UI(alert/busy)를
// 뺀 부분 — 테스트 가능하게 분리했다.
//
// 규칙:
//  - 전송이 하나라도 실패하면 재적재하지 않고 미확정을 유지한다(기존 규칙).
//  - 재적재 실패는 전송 성공을 되돌리지 않는다. 캐시는 파생 데이터이고,
//    SheetCache.refresh 가 실패 시 노드를 삭제해 다음 읽기를 시트로 강등한다.
import TennisSync from '../../services/tennisSync';
import SheetCache from '../../services/sheetCache';

export async function finalizeTennisRecords({ matchRows, pgRows }) {
  const results = await Promise.allSettled([
    TennisSync.writeMatches(matchRows),
    TennisSync.writePlayerGames(pgRows),
  ]);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    return { ok: false, failed: failed.map(f => f.reason?.message || '알 수 없는 오류') };
  }
  try {
    await SheetCache.refresh('playerGames');
  } catch (e) {
    console.warn('[sheetCache] 마감 후 재적재 실패:', e?.message);
  }
  return { ok: true, failed: [] };
}
