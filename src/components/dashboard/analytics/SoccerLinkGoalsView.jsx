// 축구 케미 「합작 골」 — 하버FC 베스트 듀오(케미 랭킹)를 대체(2026-11-12). 계산은 soccerAnalytics/calcLinkGoals.
// 풋살은 DuoCardsView(카드 3장)를 그대로 쓴다 — 이 컴포넌트는 축구 경로에서만 렌더된다.
import { useMemo } from 'react';
import { calcLinkGoals } from '../../../utils/soccerAnalytics';
import RankBarList from './RankBarList';

export default function SoccerLinkGoalsView({ matchLogs, eventLogs, C }) {
  const rows = useMemo(
    () => calcLinkGoals({ matchLogs: matchLogs || [], eventLogs: eventLogs || [], topN: 10 }),
    [matchLogs, eventLogs]
  );
  return (
    <div style={{ background: C.cardLight, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>합작 골 TOP 10</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 8, lineHeight: 1.5 }}>
        어시 → 골로 이어진 골을 두 방향 합산한 절대수(로그_이벤트 기준, 진입선 없음). 같은 골 수는 공동 순위입니다.
        보조 숫자는 「앞 이름 득점(뒤 이름 어시) · 뒤 이름 득점(앞 이름 어시) / 함께 뛴 경기일」.
      </div>
      <RankBarList
        rows={rows.map(p => ({ name: `${p.members[0]} + ${p.members[1]}`, value: p.count, rank: p.rank, sub: `${p.aToB}·${p.bToA} / ${p.sessions}일` }))}
        formatValue={v => `${v}골`} color={C.green} C={C} limit={rows.length} nameWidth={92} subWidth={66}
      />
    </div>
  );
}
