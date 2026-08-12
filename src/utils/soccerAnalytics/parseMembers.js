// our_members_json / opponent_members_json 파서.
// 두 형식 모두 수용:
//   1) ["A","B","C"]                              — 레거시 / 휴식 없음
//   2) { "players": ["A","B","C"], "absent": ["C"] } — 휴식 정보 포함
// 반환: { players: string[], absent: string[], actual: string[] }
//   - players: 그날 그 팀 로스터 (휴식 포함)
//   - absent : 휴식 명단
//   - actual : 실제 출전 명단 (players \ absent)
export function parseMembersWithAbsent(s) {
  try {
    const parsed = JSON.parse(s || '[]');
    if (Array.isArray(parsed)) {
      const players = parsed.filter(x => typeof x === 'string' && x);
      return { players, absent: [], actual: players };
    }
    if (parsed && typeof parsed === 'object') {
      const players = Array.isArray(parsed.players)
        ? parsed.players.filter(x => typeof x === 'string' && x) : [];
      const absentRaw = Array.isArray(parsed.absent)
        ? parsed.absent.filter(x => typeof x === 'string' && x) : [];
      const absent = absentRaw.filter(p => players.includes(p));
      const absentSet = new Set(absent);
      const actual = players.filter(p => !absentSet.has(p));
      return { players, absent, actual };
    }
    return { players: [], absent: [], actual: [] };
  } catch {
    return { players: [], absent: [], actual: [] };
  }
}

// 단순 출전 명단만 필요한 경우 (대부분 분석 코드)
export function parseActualPlayers(s) {
  return parseMembersWithAbsent(s).actual;
}
