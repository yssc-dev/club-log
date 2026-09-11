// 빅마스터FC 증분 3(스펙 §14): 여러 명이 동시에 기록할 때 원격 '배치' 변경을 화면에 반영하기 위한 순수 계산.
// FormationRecorder 는 uncontrolled(배치를 마운트 시 1회 시드)라, 원격 배치 변경은 key 를 바꿔 재마운트해야
// 보이고 또 내 다음 저장이 남의 변경을 덮지 않는다. 이벤트·점수는 이미 prop 파생이므로 지문에 넣지 않는다
// (넣으면 골 하나에도 재마운트돼 진행 중 입력이 날아간다).
const str = (v) => (v == null ? '' : String(v));

export function formationFingerprint(view) {
  const v = view || {};
  const asg = v.assignments && typeof v.assignments === 'object' ? v.assignments : {};
  const pm = v.positionMap && typeof v.positionMap === 'object' ? v.positionMap : {};
  const subs = Array.isArray(v.subs) ? [...v.subs].map(str).sort() : [];
  // 슬롯 키는 숫자 오름차순(문자열 정렬이면 '10' < '2' 가 되어 같은 배치가 다른 지문이 될 수 있다)
  const asgPart = Object.keys(asg)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => `${k}=${str(asg[k])}`)
    .join(',');
  const pmPart = Object.keys(pm).sort().map(k => `${k}=${str(pm[k])}`).join(',');
  return `f:${str(v.formation)}|g:${str(v.gk)}|a:${asgPart}|p:${pmPart}|s:${subs.join(',')}`;
}

// 현재 지문이 '내가 만든 것'인지 '남이 만든 것'인지 가려 재마운트 여부를 정한다.
//   localFps: 내가 보냈지만 아직 왕복 echo 가 오지 않은 지문들(Set). consume 으로 1회만 소비한다 —
//   같은 지문을 영구 억제하면, 남이 내 상태를 되돌렸을 때 그것을 내 echo 로 오인한다.
export function decideRemount({ currentFp, seedFp, localFps, busy }) {
  if (currentFp === seedFp) return { remount: false, pending: false, consume: null };
  if (localFps && typeof localFps.has === 'function' && localFps.has(currentFp)) {
    return { remount: false, pending: false, consume: currentFp };
  }
  if (busy) return { remount: false, pending: true, consume: null };
  return { remount: true, pending: false, consume: null };
}
