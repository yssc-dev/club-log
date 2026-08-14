// 앱 기록 구간 스코프 (축구 전용).
//
// 로그_매치의 game_id가 'legacy_'로 시작하면 앱 도입 이전 경기다. 그 구간의
// our_members_json은 출전 명단 원본이 없어 골 이벤트에서 역산한 부분 명단이라
// (실측 평균 3.2명, legacy 59경기 전부가 '골·어시 참여자 집합'과 정확히 일치),
// 그 구간에서 한 선수의 '경기수'는 사실상 '골·어시를 낸 경기수'다.
//
// 그래서 **명단이 분모로 들어가는 지표는 이 구간을 뺀다.** 섞으면 골을 넣는 선수만
// 출전으로 잡혀 승률·참석률·케미가 구조적으로 부풀려진다
// (실측: legacy 구간 팀 성적 44승6무9패=75% vs 앱 구간 27승14무19패=45%).
//
// 반대로 골·어시 같은 **이벤트 기반 누적은 legacy도 원본이라 정확**하므로 거르지 않는다
// (거르면 골 213건 중 116건이 사라진다). 그쪽은 범위를 캡션으로 밝힌다.
export function isLegacyMatch(m) {
  return String(m?.game_id || '').startsWith('legacy_');
}

export function scopeAppEra(matchLogs) {
  return (matchLogs || []).filter(m => !isLegacyMatch(m));
}

// 캡션용 — "언제 이후 데이터인지"를 하드코딩하지 않고 데이터에서 뽑는다.
// 앱 기록 경기가 하나도 없으면 null (소비자는 캡션을 생략).
export function appEraStart(matchLogs) {
  const dates = scopeAppEra(matchLogs).map(m => m?.date).filter(Boolean).sort();
  return dates[0] || null;
}
