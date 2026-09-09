// 시트 쓰기 직후 캐시 재적재. 순차로 돌리면 데이터셋 수 × 콜드스타트라
// 마감 대기가 길어진다 — 병렬로 한 번에 보낸다.
//
// 캐시는 파생 데이터다. 어떤 실패도 마감/전송의 성공을 되돌리지 않는다.
// SheetCache.refresh 는 이미 내부에서 강등 처리하고 throw 하지 않지만,
// 계약이 바뀌어도 마감이 깨지지 않도록 여기서도 삼킨다.
//
// sport: 겸직팀(한 팀에 풋살·축구 탭이 함께 뜨는 TeamDashboard)은
// AuthUtil.getStored().mode 가 팀 선택 시 한 번만 저장되고 화면의 종목
// 토글로는 갱신되지 않는다. 화면 종목을 아는 호출부는 반드시 넘겨야
// SheetCache 가 엉뚱한 종목 캐시를 재적재하지 않는다.
import SheetCache from '../services/sheetCache';

export async function refreshAfterFinalize(datasets, { sport } = {}) {
  const list = Array.isArray(datasets) ? datasets : [];
  if (list.length === 0) return;
  await Promise.all(list.map(d =>
    SheetCache.refresh(d, { sport }).catch(e => {
      console.warn(`[sheetCache] ${d} 마감 후 재적재 실패:`, e?.message);
      return null;
    })
  ));
}

// 마감이 건드리는 5개 시트가 캐시 7종 전부를 낡게 만든다
// (맵 2종도 선수별집계 시트에서 파생된다).
export const FINALIZE_DATASETS = [
  'matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog',
  'latestDeltas', 'cumulativeBonus',
];

// 대회 기록은 로그_이벤트·로그_선수경기에만 쓴다.
export const TOURNAMENT_DATASETS = ['eventLog', 'playerGameLog'];
