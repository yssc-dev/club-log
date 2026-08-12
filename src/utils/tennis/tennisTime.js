// 로그 input_time을 한국시간(KST, UTC+9)으로 기록한다.
// KST는 서머타임이 없어 고정 오프셋으로 안전하게 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

export function toKSTString(date) {
  // UTC 기준 시각에 +9h 한 뒤 그 값을 UTC 필드로 읽으면 KST 벽시계 시각이 된다.
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())} `
    + `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`;
}

export function nowKST() {
  return toKSTString(new Date());
}
