// P4: 단독골(어시 없음) vs 받아먹은 골(어시 있음). owngoal 제외.
// threshold 생략(null) 시 동적: 최다 골(개인 총 골)의 30%(올림) — dynamicMin 참조.
// 축구는 호출부에서 고정 10을 명시.
import { dynamicMin } from './dynamicMin';

export function calcSoloGoalRatio({ eventLogs, threshold = null }) {
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
