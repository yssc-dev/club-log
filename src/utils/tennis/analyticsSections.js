// 분석 탭 뷰 전환: 선수 미선택=전체 랭킹, 선택=개인 분석. 렌더가 이 키 목록만 그린다.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
// mode='legacy': 레거시 연도(집계만)→['legacyStandings']. mode 기본='row'(하위호환).
// hasMonth: 특정 월 선택 시 monthly 제외. 기본 false(하위호환).
export function analyticsSectionKeys({ player, format, hasLegacy, mode = 'row', hasMonth = false }) {
  if (mode === 'legacy') return ['legacyStandings'];   // 레거시 연도: 집계 순위만
  // 이하 기존 로우 모드 로직
  if (!player) {
    return format === '복식'
      ? ['doublesStandings', 'chemistry', 'tb', 'acedf']
      : ['singlesStandings', 'tb', 'acedf'];
  }
  const keys = ['summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
