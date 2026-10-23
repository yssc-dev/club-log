// src/components/cup/CupAwardsCards.jsx
// 컵 어워드 카드 목록 — 계산된 awards 배열을 받아 그린다.
// 2026-10-23: 재는 기준이 다른 카드를 묶음(CUP_AWARD_GROUPS)으로 갈라 경계선과 머리글을 둔다.
//   개인 기록 / 골키퍼(GK로 선 경기) / 팀 영향력(필드 기준) / 참석 — 분류 자체는 계산층이 소유한다.
//   group 이 없는 카드(구버전 데이터)는 맨 끝에 머리글 없이 붙여 사라지지 않게 한다.
// rows 카드: { key, title, note?, rows:[{ rank, name, value, display, ratio, sub? }] }
//   sub(관여 카드만): 행 아래 회색 한 줄 "뛸 때 2.50 · 없을 때 0.67" — 차이값의 기준값(2026-10-02).
// 개근 카드: { key, title, names, value }  (rows 없음)
import { useTheme } from '../../hooks/useTheme';
import { CUP_AWARD_GROUPS } from '../../utils/cup/cupInsights';

export default function CupAwardsCards({ awards = [] }) {
  const { C } = useTheme();
  if (!awards.length) return null;

  // 묶음별로 나눠 담는다(묶음 순서 고정). 어디에도 안 속한 카드는 '기타'로 맨 끝.
  const known = new Set(CUP_AWARD_GROUPS.map(g => g.key));
  const sections = CUP_AWARD_GROUPS
    .map(g => ({ ...g, cards: awards.filter(a => a.group === g.key) }))
    .concat([{ key: '_rest', label: '', note: '', cards: awards.filter(a => !known.has(a.group)) }])
    .filter(sec => sec.cards.length > 0);

  const renderCard = (a) => (
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
  );

  return (
    <div data-role="cup-awards">
      {sections.map((sec, i) => (
        <div
          key={sec.key}
          data-role="cup-award-group"
          data-group={sec.key}
          style={{
            // 묶음 사이 경계선 — 첫 묶음 위에는 긋지 않는다.
            // 색이 CSS 변수(var(--app-divider))라 shorthand 로 쓰면 jsdom 이 longhand 로
            // 분해하지 못해(선언은 남지만 style.borderTopWidth 가 빈다) 테스트가 두께를
            // 못 읽는다 → 분리 속성으로 둔다. 자세한 내용은 src/test-utils/domStyle.js.
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopStyle: 'solid',
            borderTopColor: C.borderColor,
            paddingTop: i === 0 ? 0 : 10,
            marginTop: i === 0 ? 0 : 10,
          }}
        >
          {sec.label && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{sec.label}</div>
              {sec.note && <div style={{ fontSize: 11, color: C.gray }}>{sec.note}</div>}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sec.cards.map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  );
}
