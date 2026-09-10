// 자체전 로그_매치의 opponent_members_json 객체형 { players, formation, defenders } 에서 추가 키를 읽는다.
// players/absent 는 parseMembers.js 가 읽는다(그 파서는 나머지 키를 무시한다 — 기존 소비자 무영향).
export function parseSideExtras(s) {
  try {
    const p = JSON.parse(s || '[]');
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return {
        formation: typeof p.formation === 'string' ? p.formation : '',
        defenders: Array.isArray(p.defenders) ? p.defenders.filter(x => typeof x === 'string' && x) : [],
      };
    }
  } catch { /* fallthrough */ }
  return { formation: '', defenders: [] };
}
