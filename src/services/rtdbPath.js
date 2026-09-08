// RTDB 경로 문자열의 단일 소스. 순수 함수만 — firebase 를 import 하지 않는다
// (브라우저와 vite-node 러너 양쪽에서 쓰인다).
//
// 이 로직은 firebaseSync.js 의 _safeTeam 과 scripts/tennisAutoUpload.mjs 에
// 복사본 2개로 존재했었다. 캐시가 세 번째 복사본이 되지 않도록 여기로 모았고,
// 그 둘은 이 모듈에 위임하도록 고쳤다(firebaseSync.js#_safeTeam, tennisAutoUpload.mjs
// 의 safeTeam import).
// 단, 같은 정규식(FORBIDDEN)의 복사본이 src/config/settings.js(_safeTeam),
// src/components/tournament/TournamentDashboard.jsx,
// src/components/tournament/TournamentMatchManager.jsx 에 3개 더 남아 있다.
// 이번 작업(시트 캐시) 범위를 넘는 리팩토링은 하지 않는다는 원칙(스펙 §8.1)에
// 따라 그대로 두었다 — 정리는 별도 작업으로 남긴다.

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
