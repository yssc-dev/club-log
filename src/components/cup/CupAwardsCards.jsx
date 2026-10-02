// src/components/cup/CupAwardsCards.jsx
// 컵 어워드 카드 목록 — 계산된 awards 배열을 받아 그린다.
// rows 카드: { key, title, note?, rows:[{ rank, name, value, display, ratio, sub? }] }
//   sub(관여 카드만): 행 아래 회색 한 줄 "뛸 때 2.50 · 없을 때 0.67" — 차이값의 기준값(2026-10-02).
// 개근 카드: { key, title, names, value }  (rows 없음)
import { useTheme } from '../../hooks/useTheme';

export default function CupAwardsCards({ awards = [] }) {
  const { C } = useTheme();
  if (!awards.length) return null;

  return (
    <div
      data-role="cup-awards"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
    >
      {awards.map((a) => (
        <div
          key={a.key}
          data-role="cup-award-card"
          data-key={a.key}
          style={{
            flex: '1 1 calc(50% - 4px)',
            minWidth: 160,
            background: C.card,
            border: `1px solid ${C.borderColor}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          {/* 카드 헤더: 제목 + note (note 가 길면 다음 줄로) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.gray }}>{a.title}</div>
            {a.note && (
              <div style={{ fontSize: 11, color: C.gray }}>{a.note}</div>
            )}
          </div>

          {/* rows 카드 (득점왕, 도움왕, 클린시트왕, 수문장, 관여)
              바깥 div = 행(기준값 줄 포함), 안쪽 flex = 순위·이름·막대·값 한 줄.
              flex 행에 wrap 을 주면 좁은 화면에서 값이 다음 줄로 떨어지므로 wrap 없이 블록으로 쌓는다. */}
          {Array.isArray(a.rows) && a.rows.map((row) => (
            <div
              key={`${row.name}-${row.rank}`}
              data-role="cup-award-row"
              data-rank={row.rank}
              style={{ marginBottom: row.sub ? 5 : 3 }}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* 순위 뱃지 */}
              <div style={{
                width: 14,
                fontSize: 11,
                flexShrink: 0,
                color: row.rank === 1 ? 'var(--accent, #FF9500)' : C.gray,
                fontWeight: row.rank === 1 ? 700 : 400,
              }}>
                {row.rank}
              </div>

              {/* 이름 */}
              <div style={{
                fontSize: 12,
                fontWeight: row.rank === 1 ? 700 : 400,
                color: C.white,
                maxWidth: 64,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {row.name}
              </div>

              {/* 막대 트랙 */}
              <div style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: C.borderColor || 'var(--app-bg-row)',
                overflow: 'hidden',
              }}>
                <div
                  data-role="cup-award-bar"
                  data-ratio={row.ratio}
                  style={{
                    width: `${Math.round(row.ratio * 100)}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: row.rank === 1
                      ? 'var(--accent, #FF9500)'
                      : 'rgba(128,128,128,0.4)',
                  }}
                />
              </div>

              {/* display 값 */}
              <div style={{
                fontSize: 11,
                color: C.white,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                minWidth: 44,
                maxWidth: 72,
                flexShrink: 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}>
                {row.display}
              </div>
            </div>

              {/* 기준값 줄 (관여 카드만): 순위 뱃지 폭만큼 들여쓰고 행 전체 폭 사용 */}
              {row.sub && (
                <div
                  data-role="cup-award-sub"
                  style={{
                    paddingLeft: 18,
                    marginTop: 1,
                    fontSize: 10,
                    color: C.gray,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row.sub}
                </div>
              )}
            </div>
          ))}

          {/* 개근 카드 (names/value, rows 없음) */}
          {!Array.isArray(a.rows) && (
            <>
              <div style={{ fontSize: 14, color: C.white, fontWeight: 700, marginBottom: 2 }}>
                {a.names && a.names.length > 0 ? a.names.join(' · ') : '—'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--accent, #FF9500)' }}>{a.value}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
