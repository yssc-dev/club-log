// 시트 쓰기 직후 캐시 재적재. 순차로 돌리면 데이터셋 수 × 콜드스타트라
// 마감 대기가 길어진다 — 한 번에 전부 쏜다(Promise.all).
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

// 마감이 건드리는 5개 시트는 그 종목 캐시 전부를 낡게 만든다(맵 2종도 선수별집계
// 시트에서 파생된다). 그래서 목록을 손으로 복제하지 않고 어댑터 레지스트리에서
// 가져온다 — 종목별 어댑터 차이(cumulativeBonus 는 풋살만: 축구 선수집계 시트에
// 크로바·고구마 열이 없다)가 자동으로 반영되고, 새 데이터셋을 추가할 때 이 파일을
// 고치는 것을 잊어도 마감 재적재가 알아서 포함한다.
//
// sport 를 생략하면 SheetCache 가 쓰는 기본값(AuthUtil.getStored().mode)을 따른다.
// 단 그 기본값이 화면 종목과 갈릴 수 있으므로(위 주석) 마감 호출부는 명시한다.
export async function refreshAfterFinalize({ sport } = {}) {
  const sp = sport || SheetCache.currentSport();
  await refreshDatasets(SheetCache.datasetsOf(sp), { sport: sp });
}

// 데이터셋을 직접 지정하는 경로(대회 종료·로그_매치 덮어쓰기처럼 일부 시트만 쓴 경우).
export async function refreshDatasets(datasets, { sport } = {}) {
  const list = Array.isArray(datasets) ? datasets : [];
  if (list.length === 0) return;
  await Promise.all(list.map(d =>
    SheetCache.refresh(d, { sport }).catch(e => {
      console.warn(`[sheetCache] ${d} 마감 후 재적재 실패:`, e?.message);
      return null;
    })
  ));
}

// 대회 기록은 로그_이벤트·로그_선수경기에만 쓴다 — 전체가 아니라 2종뿐이라 명시한다.
export const TOURNAMENT_DATASETS = ['eventLog', 'playerGameLog'];
