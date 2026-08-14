// 분석 탭: 서브탭 view('individual'=개인지표 / 'overall'=전체지표)로 뷰 전환. 정식 순위는 리그 탭 소유.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
// hasMonth: 특정 월 선택 시 monthly 제외. 기본 false.
export function analyticsSectionKeys({ view = 'individual', player, format, hasLegacy, hasMonth = false }) {
  if (view === 'overall') {
    return format === '복식'
      ? ['chemistry', 'tb', 'acedf']
      : ['tb', 'acedf'];
  }
  // 개인지표: 선수 미선택이면 빈 목록(호출부가 '선수를 선택하세요' 힌트 표시)
  if (!player) return [];
  const keys = ['radar', 'summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
