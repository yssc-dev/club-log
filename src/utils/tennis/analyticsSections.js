// 분석 탭 섹션 구성.
//  - view: 'individual'(개인지표) / 'overall'(전체지표).
//  - 개인지표는 다시 indivTab로 나뉜다: 'summary'(요약) / '단식' / '복식'.
//  - 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
//  - hasMonth: 특정 월 선택 시 monthly 제외. hasLegacy: 연도별 전적 있을 때만 yearly.
export function analyticsSectionKeys({ view = 'individual', indivTab = 'summary', player, format, hasLegacy, hasMonth = false }) {
  if (view === 'overall') {
    // 'report'(선수 성적표)는 format 토글에 연동해 그 종목만 집계, 항상 맨 위.
    return format === '복식'
      ? ['report', 'chemistry', 'tb', 'acedf']
      : ['report', 'tb', 'acedf'];
  }
  // 개인지표: 선수 미선택이면 빈 목록(호출부가 '선수를 선택하세요' 힌트 표시)
  if (!player) return [];
  if (indivTab === 'summary') return ['radar', 'recent', 'summaryDash'];

  // 단식 / 복식 탭 — 그 종목 상세
  const keys = ['formatSummary'];
  if (indivTab === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
