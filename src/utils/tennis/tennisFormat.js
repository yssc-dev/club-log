// 승률 등 비율(0~1) → 반올림 퍼센트 문자열. 0 이하는 '-'.
export const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';
