// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useMemo, useEffect } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import GoldenTrioView from './GoldenTrioView';
import AssistPairList from './AssistPairList';
import DefenseAnalysisView from './DefenseAnalysisView';
import OpponentLeadersView from './OpponentLeadersView';
import * as soccerCalc from '../../../utils/soccerAnalytics';

export default function ChemistryTab({ matchLogs, eventLogs, C, isSoccer = false }) {
  const { calcAssistPairs, calcSynergyMatrix } = isSoccer ? soccerCalc : futsalCalc;
  const [sub, setSub] = useState('trio');
  // 종목 전환 시 종목 전용 서브탭(defense/rival)에 좌초 방지 — TeamDashboard activeTab 'records' 리셋과 동일 규약
  useEffect(() => { setSub('trio'); }, [isSoccer]);

  // 어시페어 노출 보정 분모(함께 뛴 라운드 수)용 — calcSynergyMatrix를 탭 자체적으로 수행
  const synergyMatrix = useMemo(
    () => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }),
    [matchLogs]
  );
  const assistPairs = useMemo(
    () => calcAssistPairs({ eventLogs: eventLogs || [], threshold: 3, topN: 10, synergyCells: synergyMatrix.cells }),
    [eventLogs, synergyMatrix]
  );

  const subs = [
    { key: 'trio', label: '베스트 듀오' },
    { key: 'assist', label: '어시페어' },
    // 수비케미는 our_defenders_json이 있는 축구 전용
    ...(isSoccer ? [{ key: 'defense', label: '수비케미' }] : []),
    // 축구판 대응: 외부 상대팀별 리더보드
    ...(isSoccer ? [{ key: 'opponent', label: '상대팀별' }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: sub === s.key ? C.accent : 'transparent',
            color: sub === s.key ? C.black : C.gray,
            border: `1px solid ${sub === s.key ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>
      {sub === 'trio' && <GoldenTrioView matchLogs={matchLogs} C={C} isSoccer={isSoccer} />}
      {sub === 'assist' && <AssistPairList pairs={assistPairs} C={C} />}
      {sub === 'defense' && isSoccer && <DefenseAnalysisView matchLogs={matchLogs} C={C} />}
      {sub === 'opponent' && isSoccer && <OpponentLeadersView matchLogs={matchLogs} eventLogs={eventLogs} C={C} />}
    </div>
  );
}
