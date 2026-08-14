// src/components/dashboard/analytics/AssistPairList.jsx
import RankBarList from './RankBarList';

export default function AssistPairList({ pairs, C }) {
  if (!pairs || pairs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        어시 페어 데이터 없음 (페어당 누적 3회 이상 필요)
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        같은 페어가 반복적으로 만든 골. 페어당 누적 ≥ 3회. 괄호는 함께 뛴 라운드 수 대비 빈도 — 오래 함께 뛴 조합의 노출 편향 보정.
      </div>
      {/* 이름 칸이 'A → B' 방향쌍이라 일반 순위 목록보다 넓게 잡는다 */}
      <RankBarList
        rows={pairs.map(p => ({
          name: `${p.assister} → ${p.scorer}`,
          value: p.count,
          sub: p.sharedGames != null ? `${p.perSharedGame.toFixed(2)}/R` : null,
        }))}
        formatValue={v => `${v}회`} color={C.green} C={C} limit={10} nameWidth={92}
      />
    </div>
  );
}
