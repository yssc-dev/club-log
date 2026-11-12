// 합작 골 (축구 전용) — 하버FC 케미 탭 「베스트 듀오」를 이 카드 하나로 교체(2026-11-12 유저 결정).
//
// 마스터FC 풋살 calcDuoCards(analyticsV2)의 합작 골 카드를 축구로 옮긴 것. 동반 승리·실점 억제는
// 축구에 옮기지 않았다: 우리 팀 11명이 매 경기 같은 편이라 동반 승리는 "같이 출석한 경기 수 ×
// 팀 승률"이 되고, 실점 억제는 11명 묶음이라 두 사람 기여가 흐려진다(수비는 「수비케미」 탭 담당).
// 케미 랭킹(calcGoldenTrio)은 5경기 진입선 상위가 소표본 노이즈라 화면에서 내렸다.
//
// 합작 골 = 로그_이벤트 goal 의 (득점자 player, 어시 related_player) 쌍을 두 방향 합산한 절대수.
// aToB = 가나다순 앞 이름 득점(뒤 이름 어시), bToA = 반대. sessions = 둘이 함께 명단에 든 경기일 수.
// 축구는 득점이 적어 동률이 많다 → rank 는 공동 순위(1,1,3…)로 매긴다.
import { parseActualPlayers } from './parseMembers';

const pairKey = (x, y) => [x, y].sort((a, b) => a.localeCompare(b, 'ko')).join('|');

export function calcLinkGoals({ matchLogs, eventLogs, topN = 10 }) {
  const cells = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = String(e.player || '').trim(), assister = String(e.related_player || '').trim();
    if (!scorer || !assister || scorer === assister) continue;
    const key = pairKey(scorer, assister);
    const c = (cells[key] ||= { count: 0, aToB: 0, bToA: 0 });
    c.count++;
    if (scorer === key.split('|')[0]) c.aToB++; else c.bToA++;
  }

  const dates = {};
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const members = [...new Set(parseActualPlayers(m.our_members_json))];
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        (dates[pairKey(members[i], members[j])] ||= new Set()).add(m.date);
  }

  const sorted = Object.entries(cells)
    .map(([key, c]) => ({ members: key.split('|'), count: c.count, aToB: c.aToB, bToA: c.bToA, sessions: dates[key]?.size ?? 0 }))
    .sort((a, b) => b.count - a.count
      || a.members[0].localeCompare(b.members[0], 'ko') || a.members[1].localeCompare(b.members[1], 'ko'));

  let rank = 0;
  const ranked = sorted.map((p, i) => {
    if (i === 0 || p.count !== sorted[i - 1].count) rank = i + 1;
    return { ...p, rank };
  });
  // topN 경계에서 동률이 잘리면 그 동률까지 포함한다(같은 골 수인데 한쪽만 보이는 것 방지).
  // 경계 동률 무리가 너무 크면(예: 1골짜리 수십 개) 그 무리는 통째로 뺀다.
  if (ranked.length <= topN) return ranked;
  const cut = ranked[topN - 1].count;
  const extended = ranked.filter((p, i) => i < topN || p.count === cut);
  return extended.length > topN + 5 ? ranked.filter(p => p.count > cut) : extended;
}
