// 어워드 탭 기간 토글(누적 / 최근 한 달)의 단일 소스.
//
// 계산층이 아니라 화면 진입부에서 로그 3종(matchLogs/eventLogs/playerGameLogs)을
// 한 번만 잘라 기존 calcXxx에 그대로 흘려보낸다. 계산 함수 내부는 건드리지 않으므로
// 카드가 늘어나도 자동으로 따라온다.
//
// ★ 창 규약은 calcRecentHotStreak / calcRecentForm과 **같은 식**이다:
//     cutoff = anchor − 30일,  포함 조건 = date >= cutoff
//   양끝 포함이라 실제 폭은 31일이다. "30일 창"이라는 이름과 하루 어긋나 보이지만,
//   대시보드 최근폼 카드와 어워드가 같은 선수를 다르게 판정하면 안 되므로
//   기존 규약을 그대로 따른다(2026-09-04 적대적 리뷰에서 지적된 불일치).
//
// ★ 기준일(anchor)은 오늘(Date.now)이 아니라 **로그의 마지막 날짜**다.
//   - 휴식기 뒤에 열어도 "최근 한 달"이 비지 않는다(시트는 오늘보다 며칠 뒤처진다)
//   - 입력이 같으면 결과가 같아 테스트가 결정적이다
//   calcRecentHotStreak은 자기가 받은 배열 하나에서 anchor를 뽑지만, 여기서는
//   탭 전체가 한 창을 공유해야 하므로 세 배열의 최대 날짜를 함께 본다.
//   (로그_이벤트만 갱신이 늦는 경우에도 매치/PG 기준으로 창이 잡힌다)

export const RECENT_WINDOW_DAYS = 30;

// analyticsV2 / soccerAnalytics 안에도 같은 함수가 있지만 두 계층은 종목 전용이라
// 서로/바깥에서 import하지 않는 규약이다(dynamicMin이 복제된 것과 같은 이유).
// 화면 계층인 여기서는 이 사본이 정본이다.
export function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isDate = (v) => typeof v === 'string' && v.length >= 10;

// 세 배열을 통틀어 가장 늦은 날짜. 유효한 날짜가 하나도 없으면 ''.
export function latestLogDate(...arrays) {
  let max = '';
  for (const arr of arrays) {
    for (const row of arr || []) {
      const d = row && row.date;
      if (isDate(d) && d > max) max = d;
    }
  }
  return max;
}

// 최근 한 달 창의 하한(포함). 기준일이 없으면 null — 호출부가 필터를 건너뛴다.
export function recentCutoff(logs) {
  const anchor = latestLogDate(logs.matchLogs, logs.eventLogs, logs.playerGameLogs);
  return anchor ? shiftDays(anchor, -RECENT_WINDOW_DAYS) : null;
}

// period가 'recent'가 아니면 **입력 객체를 그대로 돌려준다**(복사도 하지 않는다).
// 누적 화면의 결과와 참조 동일성이 모두 지금과 바이트 단위로 같아야 하기 때문.
export function filterLogsByPeriod(logs, period) {
  if (period !== 'recent') return logs;
  const cutoff = recentCutoff(logs);
  if (!cutoff) return logs;
  const cut = (arr) => (arr || []).filter(r => r && isDate(r.date) && r.date >= cutoff);
  return {
    matchLogs: cut(logs.matchLogs),
    eventLogs: cut(logs.eventLogs),
    playerGameLogs: cut(logs.playerGameLogs),
  };
}
