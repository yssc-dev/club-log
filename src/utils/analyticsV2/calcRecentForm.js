// 폼 비교 — "평소(과거 전체) vs 최근 1달"의 경기당 골/어시/팀 승률 (개인분석 탭 카드, 풋살 전용).
// 기준일은 오늘(Date.now)이 아니라 **로그_매치의 마지막 세션 날짜**:
//   - 휴식기(한 달 이상 공백) 뒤에 열어도 "마지막 한 달치"가 비지 않는다
//   - 입력이 같으면 결과가 같아 테스트가 결정적이다
// 골/어시는 PG(로그_선수경기) 날짜별 누적, 경기수/승률은 로그_매치 명단(휴식 제외)·양 사이드.
import { parseActualPlayers } from './parseMembers';

const shiftDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function calcRecentForm({ playerName, playerLogs = [], matchLogs = [], windowDays = 30 } = {}) {
  if (!playerName) return null;

  const mine = [];
  let anchorDate = '';
  for (const m of matchLogs) {
    if (m.is_extra) continue;
    const date = m.date || '';
    if (!date) continue;
    if (date > anchorDate) anchorDate = date; // 클럽 전체 마지막 세션 기준
    const home = parseActualPlayers(m.our_members_json);
    const away = parseActualPlayers(m.opponent_members_json);
    const side = home.includes(playerName) ? 'our' : away.includes(playerName) ? 'opp' : null;
    if (!side) continue;
    mine.push({ date, side, our: Number(m.our_score) || 0, opp: Number(m.opponent_score) || 0 });
  }
  if (!anchorDate || mine.length === 0) return null;

  const cutoff = shiftDays(anchorDate, -windowDays);
  const mkBucket = () => ({ rounds: 0, sessions: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, winRate: 0, gaPerGame: 0 });
  const baseline = mkBucket(), recent = mkBucket();
  const dates = { baseline: new Set(), recent: new Set() };

  for (const m of mine) {
    const isRecent = m.date >= cutoff;
    const b = isRecent ? recent : baseline;
    dates[isRecent ? 'recent' : 'baseline'].add(m.date);
    b.rounds++;
    const my = m.side === 'our' ? m.our : m.opp;
    const their = m.side === 'our' ? m.opp : m.our;
    if (my > their) b.wins++;
    else if (my === their) b.draws++;
    else b.losses++;
  }
  for (const p of playerLogs) {
    if (p.player !== playerName || !p.date) continue;
    const b = p.date >= cutoff ? recent : baseline;
    b.goals += Number(p.goals) || 0;
    b.assists += Number(p.assists) || 0;
  }
  baseline.sessions = dates.baseline.size;
  recent.sessions = dates.recent.size;
  for (const b of [baseline, recent]) {
    b.winRate = b.rounds > 0 ? (b.wins + 0.5 * b.draws) / b.rounds : 0;
    b.gaPerGame = b.rounds > 0 ? (b.goals + b.assists) / b.rounds : 0;
  }

  return { anchorDate, cutoff, windowDays, baseline, recent };
}
