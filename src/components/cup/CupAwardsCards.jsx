// src/components/cup/CupAwardsCards.jsx
// 컵 어워드 카드 목록 — 계산된 awards 배열을 받아 그린다.
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
            minWidth: 140,
            background: C.card,
            border: `1px solid ${C.borderColor}`,
            borderRadius: 8,
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 2 }}>{a.title}</div>
          <div style={{ fontSize: 14, color: C.white, fontWeight: 700, marginBottom: 2 }}>
            {a.names && a.names.length > 0 ? a.names.join(' · ') : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--accent, #FF9500)' }}>{a.value}</div>
          {a.note && (
            <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{a.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}
