// 설정 화면의 캐시 상태 문구. 렌더에서 분리해 단위 테스트 가능하게 둔다.

// SettingsScreen 의 실패 메시지("명부 갱신 실패")도 이 표기를 재사용한다.
export const DATASET_LABELS = { roster: '명부', playerGames: '선수경기', legacy: '레거시' };

function ago(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function hhmmKST(ts) {
  const d = new Date(ts + 9 * 3600 * 1000);
  return d.toISOString().slice(11, 16);
}

export function formatSyncStatus(entries, now = Date.now()) {
  const cached = (entries || []).filter(e => typeof e.version === 'number' && e.version > 0);
  if (cached.length === 0) return '아직 캐시 없음';
  const oldest = Math.min(...cached.map(e => e.version));
  const counts = cached
    .map(e => `${DATASET_LABELS[e.dataset] || e.dataset} ${Number(e.count || 0).toLocaleString('ko-KR')}행`)
    .join(' · ');
  return `마지막 동기화 ${hhmmKST(oldest)} (${ago(now - oldest)}) — ${counts}`;
}
