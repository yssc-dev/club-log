// src/components/cup/CupRulesToggle.jsx
// 표 위 「라벨 ⓘ」 탭 토글 — 순위표 「점수 규칙 ⓘ」(2026-10-08)와 개인기록 「정렬 기준 ⓘ」(2026-10-09)가 같이 쓴다.
// 폰에선 hover 가 없으니 탭으로 여닫고, 데스크톱은 title 로도 보인다. 기본 닫힘(경기일별 접힘과 같은 관례).
// id 는 data-role 접두어: `${id}-toggle` / `${id}-panel` — 한 화면에 여러 개 있어도 테스트·스타일이 섞이지 않는다.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function CupRulesToggle({ id, label, lines = [] }) {
  const { C } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: open ? 6 : 2 }}>
        <button type="button" data-role={`${id}-toggle`} aria-expanded={open} title={lines.join('\n')}
          onClick={() => setOpen(o => !o)}
          style={{ background: 'transparent', border: 'none', padding: '2px 4px', fontSize: 11, color: C.gray, cursor: 'pointer', fontFamily: 'inherit' }}>
          {label} ⓘ
        </button>
      </div>
      {open && (
        <ul data-role={`${id}-panel`}
          style={{ margin: '0 0 8px', padding: '8px 10px 8px 24px', fontSize: 12, lineHeight: 1.5, color: C.gray, background: C.cardLight, borderRadius: 8, border: `1px solid ${C.borderColor}` }}>
          {lines.map(line => <li key={line}>{line}</li>)}
        </ul>
      )}
    </>
  );
}
