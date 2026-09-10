// 빅마스터FC 자체전: 저장은 경기 1개(A팀 = 기존 '우리' 필드, B팀 = sideB) 한 번,
// 읽기는 이 함수로 '편 기준 하버FC 모양' 뷰를 만들어 하버FC 잎 컴포넌트·빌더를 무수정 재사용한다.
// RTDB 빈 배열 소실(undefined) 복구도 여기서만 한다 — IntraSoccerApp 계열은 경기 객체를 이 함수를 거쳐서만 읽는다.
const ARR = (v) => (Array.isArray(v) ? v : []);

export function isIntra(m) {
  return !!(m && m.sideB);
}

export function fieldsOfA(m) {
  return {
    name: (m.sideA && m.sideA.name) || 'A팀',
    lineup: ARR(m.lineup), gk: m.gk || '', defenders: ARR(m.defenders),
    formation: m.formation || null, assignments: m.assignments || null, positionMap: m.positionMap || null,
    subs: ARR(m.subs),
  };
}

export function fieldsOfB(m) {
  const b = m.sideB || {};
  return {
    name: b.name || 'B팀',
    lineup: ARR(b.lineup), gk: b.gk || '', defenders: ARR(b.defenders),
    formation: b.formation || null, assignments: b.assignments || null, positionMap: b.positionMap || null,
    subs: ARR(b.subs),
  };
}

// side 편의 하버FC 모양 경기. 외부전(sideB 없음)은 입력을 그대로(참조 동일) 돌려준다.
export function sideView(m, side) {
  if (!isIntra(m)) return m;
  const me = side === 'A' ? fieldsOfA(m) : fieldsOfB(m);
  const other = side === 'A' ? fieldsOfB(m) : fieldsOfA(m);
  const events = ARR(m.events).flatMap(e => {
    const s = e.side || 'A';
    if (s === side) return [e];
    // 상대 편 득점 → 내 시점 실점. concedeGk 는 입력 시점의 '실점한(=내) 편' GK 스냅샷이다.
    if (e.type === 'goal') return [{ type: 'opponentGoal', currentGk: e.concedeGk || '', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    if (e.type === 'owngoal') return [{ type: 'opponentOwnGoal', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    return []; // 상대 편 교체·GK변경·카드는 내 시점에 없다
  });
  // ourScore/opponentScore 는 저장 시점의 A 시점 점수라 B 뷰에서 뒤집혀 있다 — 뷰로 통과시키지 않는다.
  // 점수는 언제나 calcSoccerScore(v.events) 로 계산한다(스펙 §4).
  const { sideA, sideB, ourScore, opponentScore, ...rest } = m; // eslint-disable-line no-unused-vars
  return { ...rest, ...me, opponent: other.name, events };
}
