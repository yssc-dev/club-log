// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useEffect } from 'react';
import DuoCardsView from './DuoCardsView';
import SoccerLinkGoalsView from './SoccerLinkGoalsView';
import DefenseAnalysisView from './DefenseAnalysisView';
import OpponentLeadersView from './OpponentLeadersView';

export default function ChemistryTab({ matchLogs, eventLogs, C, isSoccer = false }) {
  const [sub, setSub] = useState('trio');
  // 종목 전환 시 종목 전용 서브탭(defense/opponent)에 좌초 방지 — TeamDashboard activeTab 'records' 리셋과 동일 규약
  useEffect(() => { setSub('trio'); }, [isSoccer]);

  const subs = [
    { key: 'trio', label: '베스트 듀오' },
    // 어시페어 서브탭은 풋살(2026-11-06)·축구(2026-11-12) 모두 제거 — 합작 골 카드와 재료가 같다(유저 결정).
    // calcAssistPairs·AssistPairList·GoldenTrioView 코드는 테스트가 쓰고 있어 남겨둔다(화면 미사용).
    // 수비케미는 our_defenders_json이 있는 축구 전용
    ...(isSoccer ? [{ key: 'defense', label: '수비케미' }] : []),
    // 축구판 대응: 외부 상대팀별 리더보드
    ...(isSoccer ? [{ key: 'opponent', label: '상대팀별' }] : []),
  ];

  return (
    <div>
      {/* 서브탭이 하나뿐(풋살)이면 버튼 줄을 그리지 않는다 */}
      {subs.length > 1 && <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: sub === s.key ? C.accent : 'transparent',
            color: sub === s.key ? C.black : C.gray,
            border: `1px solid ${sub === s.key ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>}
      {/* 풋살은 카드 3장(합작 골·동반 승리·실점 억제, 2026-11-06), 축구는 합작 골 카드 1장(2026-11-12) */}
      {sub === 'trio' && (isSoccer
        ? <SoccerLinkGoalsView matchLogs={matchLogs} eventLogs={eventLogs} C={C} />
        : <DuoCardsView matchLogs={matchLogs} eventLogs={eventLogs} C={C} />)}
      {sub === 'defense' && isSoccer && <DefenseAnalysisView matchLogs={matchLogs} C={C} />}
      {sub === 'opponent' && isSoccer && <OpponentLeadersView matchLogs={matchLogs} eventLogs={eventLogs} C={C} />}
    </div>
  );
}
