// 회원관리 폼 순수 로직 — 검증·전송 payload·목록 분리. GRADES는 tennisSchema 재사용(재선언 금지).
import { GRADES } from './tennisSchema';

export { GRADES };
export const MEMBER_TYPES = ['정회원', '게스트'];
export const MEMBER_STATUSES = ['활동', '탈퇴'];

// 신규 폼 기본값
export function blankMember() {
  return {
    row: null, name: '', nickname: '', grade: '',
    memberType: '정회원', status: '활동', seasonStartRank: '', joinDate: '', note: '',
  };
}

// 폼 검증: 이름 필수, 같은 팀 활동 동일 이름 중복(자기 자신 row 제외), 시즌시작순위 숫자/빈값.
// 신규/수정 구분은 row(=null이면 신규)로 자연 처리되므로 별도 플래그 불필요.
export function validateMember(form, existingMembers = []) {
  const errors = {};
  const name = (form.name || '').trim();
  if (!name) {
    errors.name = '이름을 입력하세요';
  } else {
    const dup = (existingMembers || []).some(m =>
      String(m.name || '').trim() === name &&
      m.status !== '탈퇴' &&
      m.row !== form.row);
    if (dup) errors.name = '같은 이름의 활동 회원이 이미 있습니다';
  }
  const r = form.seasonStartRank;
  if (r !== '' && r !== null && r !== undefined && !Number.isFinite(Number(r))) {
    errors.seasonStartRank = '숫자를 입력하세요';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// 서버 전송용 객체. seasonStartRank는 빈값이면 ""(Number("")===0 트랩 방지), 값이면 Number.
export function toWritePayload(form, { row = null } = {}) {
  const trim = (s) => (typeof s === 'string' ? s.trim() : (s ?? ''));
  const rank = form.seasonStartRank;
  return {
    ...(row != null ? { row } : {}),
    name: trim(form.name),
    nickname: trim(form.nickname),
    grade: trim(form.grade),
    memberType: form.memberType || '정회원',
    status: form.status || '활동',
    seasonStartRank: rank === '' || rank === null || rank === undefined ? '' : Number(rank),
    joinDate: trim(form.joinDate),
    note: trim(form.note),
  };
}

// 활동/탈퇴 분리 + 이름 오름차순.
export function partitionMembers(members = []) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  return {
    active: (members || []).filter(m => m.status !== '탈퇴').slice().sort(byName),
    deleted: (members || []).filter(m => m.status === '탈퇴').slice().sort(byName),
  };
}

// admin 조회 member → 폼 초안(blankMember의 역/counterpart). seasonStartRank null→""(인풋 표시용).
export function memberToForm(m) {
  return {
    row: m.row ?? null,
    name: m.name || '',
    nickname: m.nickname || '',
    grade: m.grade || '',
    memberType: m.memberType || '정회원',
    status: m.status || '활동',
    seasonStartRank: m.seasonStartRank == null ? '' : String(m.seasonStartRank),
    joinDate: m.joinDate || '',
    note: m.note || '',
  };
}
