// src/components/cup/CupPickerModal.jsx
// 경기관리 탭 "🏆 컵대회 경기" 에서 진행중 대회가 여러 개일 때 고른다(스펙 §6.1).
import Modal from '../common/Modal';
import { useTheme } from '../../hooks/useTheme';

export default function CupPickerModal({ cups, onPick, onClose }) {
  const { C } = useTheme();
  return (
    <Modal title="어느 대회의 경기인가요?" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cups.map(c => (
          <button key={c.meta.id} onClick={() => onPick(c.meta.id)}
            style={{ textAlign: "left", background: C.card, color: C.white, border: `1px solid ${C.borderColor}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            🏆 {c.meta.name} <span style={{ fontSize: 12, color: C.gray, fontWeight: 400 }}>· {c.teams.length}팀</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
