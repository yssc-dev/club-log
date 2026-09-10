// 자체전(mode==='자체전') 로그_매치 1행을 하버FC 모양 2행(A 시점·B 시점)으로 펼친다 — 수비 분석 전처리.
// 상대 버킷은 상수 '자체전'(회전 라벨 'A팀/B팀' 노이즈 차단; 단일 버킷 = 옛 전체-부재 수식). 비자체전 행은 참조 그대로.
import { parseActualPlayers } from './parseMembers';
import { parseSideExtras } from './parseSideExtras';

export function expandIntraMatchRows(matchLogs) {
  const out = [];
  for (const m of matchLogs || []) {
    if (m.mode !== '자체전') { out.push(m); continue; }
    const extras = parseSideExtras(m.opponent_members_json);
    out.push({ ...m, opponent_team_name: '자체전' });
    out.push({
      ...m,
      our_team_name: m.opponent_team_name, opponent_team_name: '자체전',
      our_members_json: JSON.stringify(parseActualPlayers(m.opponent_members_json)),
      opponent_members_json: m.our_members_json,
      our_score: m.opponent_score, opponent_score: m.our_score,
      our_gk: m.opponent_gk, opponent_gk: m.our_gk,
      formation: extras.formation,
      our_defenders_json: JSON.stringify(extras.defenders),
    });
  }
  return out;
}
