---
name: session-recover
description: 맥북 재부팅·터미널 종료·worktree 창 소실 후 이전 개발 세션들을 되찾아야 할 때 사용. "/session-recover" 또는 "세션 복구", "아까 세션 어디갔지"로 실행.
allowed-tools: Bash, Read
---

# session-recover — 재부팅 후 세션 복구

## 목적
Claude Code 세션의 대화 컨텍스트는 transcript(`~/.claude/projects/`)에 영구 저장되므로 **재부팅으로 사라지지 않는다**. 사라지는 건 터미널 창뿐이다. 이 스킬은 이 프로젝트(footsal_webapp, 메인+worktree)의 최근 세션들을 **worktree(작업)별로 매핑한 표**와 세션별 `claude --resume` 복구 명령을 만들어 준다.

## 실행

```bash
/usr/bin/python3 .claude/skills/session-recover/scan.py --days 7
```

- `--days N` : 조회 범위(기본 7일). 인자로 숫자가 오면 그대로 전달 (예: `/session-recover 3`)
- `--all` : 실요청 없는 빈 세션도 표시

worktree 안에서 실행해도 스크립트가 스스로 메인 repo 경로를 도출해 메인+전체 worktree 세션을 함께 스캔한다.

## 출력 해석·안내

스크립트 출력(세션 표 + 복구 명령 블록)을 그대로 보여주고, 다음을 안내한다:

1. **복구할 세션을 고르면** 해당 줄의 명령을 새 터미널(또는 새 worktree 창)에 붙여넣는다:
   ```
   cd '<세션의 원래 경로>' && claude --resume <세션ID>
   ```
   → 이전 대화 컨텍스트 전체가 그대로 이어진다.
2. 표의 `메인→<이름>`은 메인 repo에서 시작해 해당 worktree에서 작업하던 세션, `<이름>` 단독은 worktree 안에서 시작한 세션이다.
3. worktree가 이미 정리(배포 완료)된 세션은 resume은 되지만 이어서 할 작업이 없을 수 있다 — 표의 첫 요청 발췌로 판단.
4. 현재 세션이 표에 섞여 있을 수 있다(가장 최근 활동). resume 대상에서 제외.

## 주의
- 읽기 전용 — transcript를 읽기만 하고 아무것도 변경하지 않는다.
- `--resume`은 반드시 **세션의 원래 디렉토리에서** 실행해야 해당 프로젝트 세션 목록에 매칭된다 (복구 명령에 cd가 포함된 이유).
- 재부팅 **전에** 미리 실행해 출력을 메모해 둘 필요 없다 — transcript는 항상 디스크에 있으므로 재부팅 후 아무 터미널에서나 이 스킬을 실행하면 된다.
- resume 대상 worktree 디렉토리가 삭제됐다면, 메인 repo 경로에서 resume하거나 worktree를 다시 만든 뒤 이어가면 된다.

ARGUMENTS: (일수 또는 빈값, --all)
