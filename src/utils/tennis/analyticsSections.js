// 분석 탭 뷰 전환: 선수 미선택=전체 랭킹, 선택=개인 분석. 렌더가 이 키 목록만 그린다.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
export function analyticsSectionKeys({ player, format, hasLegacy }) {
  if (!player) {
    return format === '복식'
      ? ['doublesStandings', 'chemistry', 'tb', 'acedf']
      : ['singlesStandings', 'tb', 'acedf'];
  }
  const keys = ['summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h', 'monthly');
  if (hasLegacy) keys.push('yearly');
  return keys;
}
