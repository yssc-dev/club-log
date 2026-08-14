import { useMemo } from 'react';
import { buildRankedTop } from '../../../utils/analyticsV2/rankUtils';
import RankBarList from './RankBarList';

export default function CrovaGogumaRankTab({ members, C }) {
  const { crovaTop, gogumaTop } = useMemo(() => {
    const crovaMap = {}, gogumaMap = {};
    for (const p of members || []) {
      const name = p.name;
      if (!name) continue;
      const c = Number(p.crova) || 0;
      const g = Math.abs(Number(p.goguma) || 0); // 시트엔 음수로 저장 → 절대값
      if (c > 0) crovaMap[name] = c;
      if (g > 0) gogumaMap[name] = g;
    }
    const buildTop = (map) =>
      buildRankedTop(
        Object.entries(map).map(([name, score]) => ({ name, value: score })),
        { limit: 5 }
      );
    return { crovaTop: buildTop(crovaMap), gogumaTop: buildTop(gogumaMap) };
  }, [members]);

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 12, textAlign: "center" }}>
        대시보드 시트의 크로바/고구마 점수 누적 순위
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <RankCard title="🍀 크로바" rows={crovaTop} color="#22c55e" C={C} />
        <RankCard title="🍠 고구마" rows={gogumaTop} color="#f97316" C={C} />
      </div>
    </div>
  );
}

function RankCard({ title, rows, color, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{title}</div>
      <RankBarList rows={rows} formatValue={v => `${v}점`} color={color} C={C} emptyText="-" />
    </div>
  );
}
