import { describe, it, expect } from 'vitest';
import {
  blankMember, validateMember, toWritePayload, partitionMembers, memberToForm,
  MEMBER_TYPES, MEMBER_STATUSES, GRADES,
} from '../memberForm';

const M = (over = {}) => ({ row: 2, name: '박성언', nickname: '', grade: '금배', memberType: '정회원', status: '활동', joinDate: '', note: '', ...over });

describe('memberForm 상수', () => {
  it('GRADES는 tennisSchema 재사용(재선언 아님)', () => {
    expect(GRADES).toEqual(['초보자', '동배', '은배', '금배']);
  });
  it('MEMBER_TYPES / MEMBER_STATUSES', () => {
    expect(MEMBER_TYPES).toEqual(['정회원', '게스트']);
    expect(MEMBER_STATUSES).toEqual(['활동', '탈퇴']);
  });
});

describe('blankMember', () => {
  it('신규 폼 기본값 — 정회원·활동·row 없음', () => {
    const b = blankMember();
    expect(b.row).toBeNull();
    expect(b.memberType).toBe('정회원');
    expect(b.status).toBe('활동');
    expect(b.name).toBe('');
  });
});

describe('validateMember', () => {
  it('이름 공백이면 에러', () => {
    const r = validateMember({ ...M(), name: '  ' }, []);
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
  });
  it('신규 추가 시 같은 팀 활동 동일 이름은 중복 경고', () => {
    const existing = [M({ row: 5, name: '문형민', status: '활동' })];
    const r = validateMember({ ...blankMember(), name: '문형민' }, existing);
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
  });
  it('탈퇴 회원과 이름이 같아도 신규 추가 허용', () => {
    const existing = [M({ row: 5, name: '문형민', status: '탈퇴' })];
    const r = validateMember({ ...blankMember(), name: '문형민' }, existing);
    expect(r.ok).toBe(true);
  });
  it('수정 시 자기 자신은 중복으로 안 잡음(row 제외)', () => {
    const existing = [M({ row: 2, name: '박성언', status: '활동' })];
    const r = validateMember(M({ row: 2, name: '박성언' }), existing);
    expect(r.ok).toBe(true);
  });
  it('수정으로 다른 활동회원 이름과 충돌하면 중복 경고', () => {
    const existing = [M({ row: 2, name: '박성언' }), M({ row: 5, name: '문형민' })];
    const r = validateMember(M({ row: 2, name: '문형민' }), existing);
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
  });
});

describe('memberToForm', () => {
  it('admin member → 폼 초안(구분·상태·비고 보존)', () => {
    const f = memberToForm({ row: 5, name: '박성언', nickname: '성언', grade: '금배', memberType: '게스트', status: '탈퇴', joinDate: '2024-01-01', note: '메모' });
    expect(f.row).toBe(5);
    expect(f.memberType).toBe('게스트');
    expect(f.status).toBe('탈퇴');
    expect(f.note).toBe('메모');
  });
});

describe('toWritePayload', () => {
  it('시즌시작순위는 payload에 없다(폐기)', () => {
    const p = toWritePayload(M(), { row: 2 });
    expect('seasonStartRank' in p).toBe(false);
  });
  it('row 없으면 payload에 row 키 없음(=신규 append)', () => {
    const p = toWritePayload(blankMember(), {});
    expect('row' in p).toBe(false);
  });
  it('row 있으면 포함, 문자열 trim, 기본값 채움', () => {
    const p = toWritePayload({ ...blankMember(), name: ' 홍길동 ', nickname: ' 길동 ', memberType: '', status: '' }, { row: 7 });
    expect(p.row).toBe(7);
    expect(p.name).toBe('홍길동');
    expect(p.nickname).toBe('길동');
    expect(p.memberType).toBe('정회원');
    expect(p.status).toBe('활동');
  });
});

describe('partitionMembers', () => {
  it('활동/탈퇴 분리 + 이름 오름차순', () => {
    const members = [
      M({ row: 2, name: '박성언', status: '활동' }),
      M({ row: 3, name: '김원희', status: '탈퇴' }),
      M({ row: 4, name: '가나다', status: '활동' }),
    ];
    const { active, deleted } = partitionMembers(members);
    expect(active.map(m => m.name)).toEqual(['가나다', '박성언']);
    expect(deleted.map(m => m.name)).toEqual(['김원희']);
  });
  it('빈 입력 안전', () => {
    expect(partitionMembers()).toEqual({ active: [], deleted: [] });
  });
});
