// threshold에 **null을 명시**하면 동적: 최다 골(개인 총 골)의 30%(올림) — dynamicMin 참조.
// 어워드 탭 '최근 한 달'이 이 경로를 쓴다. 생략하면 고정 10이라 누적 화면은 무변경.
import { dynamicMin } from './dynamicMin';
// P4: 단독골(어시 없음) vs 받아먹은 골(어시 있음). owngoal 제외.

export function calcSoloGoalRatio({ eventLogs, threshold = 10 }) {
  const perPlayer = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const player = e.player;
    if (!player) continue;
    if (!perPlayer[player]) perPlayer[player] = { solo: 0, assisted: 0, total: 0, soloRatio: 0 };
    if (e.related_player) perPlayer[player].assisted += 1;
    else perPlayer[player].solo += 1;
  }
  for (const p of Object.keys(perPlayer)) {
    const v = perPlayer[p];
    v.total = v.solo + v.assisted;
    v.soloRatio = v.total > 0 ? v.solo / v.total : 0;
  }

  const maxTotal = Object.values(perPlayer).reduce((m, v) => Math.max(m, v.total), 0);
  const resolvedThreshold = threshold ?? dynamicMin(maxTotal);
  const soloHeroes = Object.entries(perPlayer)
    .filter(([, v]) => v.total >= resolvedThreshold)
    .map(([player, v]) => ({ player, soloRatio: v.soloRatio, total: v.total }))
    .sort((a, b) => b.soloRatio - a.soloRatio || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { soloHeroes }, thresholds: { threshold: resolvedThreshold, maxTotal } };
}
