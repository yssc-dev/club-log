// 분석 탭 뷰 전환: 선수 미선택=부가 리더보드, 선택=개인 분석. 정식 순위는 리그 탭 소유.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
// hasMonth: 특정 월 선택 시 monthly 제외. 기본 false.
export function analyticsSectionKeys({ player, format, hasLegacy, hasMonth = false }) {
  if (!player) {
    return format === '복식'
      ? ['chemistry', 'tb', 'acedf']
      : ['tb', 'acedf'];
  }
  const keys = ['radar', 'summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
