// RTDB 경로 문자열의 단일 소스. 순수 함수만 — firebase 를 import 하지 않는다
// (브라우저와 vite-node 러너 양쪽에서 쓰인다).
//
// 이전에는 이 로직이 firebaseSync.js 의 _safeTeam 과 scripts/tennisAutoUpload.mjs 에
// 복사본 2개로 존재했다. 캐시가 세 번째 복사본이 되지 않도록 여기로 모았다.

// RTDB 키에 쓸 수 없는 문자: . # $ / [ ]
const FORBIDDEN = /[.#$/[\]]/g;

export function safeKey(value, fallback) {
  return (value || fallback).replace(FORBIDDEN, '_');
}

export function safeTeam(team) {
  return safeKey(team, '기본팀');
}

// 시트 캐시 노드 경로. shard 는 현재 항상 'all' 이고, 노드가 커지면(설계 §9)
// 연도 샤딩으로 전환할 수 있게 축만 열어둔다.
export function cachePath(team, sport, dataset, shard = 'all') {
  return `cache/${safeTeam(team)}/${safeKey(sport, '기타')}/${dataset}/${shard}`;
}
