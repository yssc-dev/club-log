#!/usr/bin/env python3
"""세션 복구 스캐너 — 맥북 재부팅/터미널 종료 후 이전 Claude Code 세션을 worktree별로 매핑.

사용: python3 scan.py [--days N] [--all]
  --days N : 최근 N일 내 활동 세션만 (기본 7)
  --all    : 빈 세션(실제 요청 없음)도 표시

출력: 최근 활동순 세션 표 + 바로 붙여넣을 수 있는 `claude --resume` 명령.
transcripts(~/.claude/projects/<slug>/*.jsonl)만 읽는다 — 어떤 상태도 변경하지 않음.
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import sys

PROJECTS_DIR = pathlib.Path.home() / ".claude" / "projects"
TAIL_BYTES = 5 * 1024 * 1024   # 대형 transcript는 꼬리 5MB만 스캔
HEAD_LINES = 2000              # cwd·첫 요청은 앞부분에서만 탐색
MAX_JSON_LINE = 200_000        # 이보다 긴 라인은 json 파싱 생략(첨부 덩어리)


def main_repo_root() -> pathlib.Path:
    """스크립트 위치에서 메인 repo 경로 도출 (worktree 사본에서 실행해도 메인 기준)."""
    p = pathlib.Path(__file__).resolve()
    s = str(p)
    if "/.claude/worktrees/" in s:
        s = s.split("/.claude/worktrees/")[0]
        return pathlib.Path(s)
    return p.parents[3]  # <repo>/.claude/skills/session-recover/scan.py


def slugify(path: pathlib.Path) -> str:
    return re.sub(r"[/._]", "-", str(path))


def session_dirs(main_slug: str):
    if not PROJECTS_DIR.is_dir():
        return
    for d in sorted(PROJECTS_DIR.iterdir()):
        if not d.is_dir():
            continue
        if d.name == main_slug or d.name.startswith(main_slug + "--claude-worktrees-"):
            yield d


def text_of(content) -> str:
    """message.content(str 또는 블록 리스트)에서 사람 텍스트만."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content
                 if isinstance(b, dict) and b.get("type") == "text"]
        return "\n".join(parts)
    return ""


def is_real_prompt(t: str) -> bool:
    t = t.strip()
    if not t or t.startswith("<"):          # command-name/caveat/system-reminder XML
        return False
    if t.startswith("[SYSTEM"):
        return False
    return True


def clip(t: str, n: int = 64) -> str:
    t = " ".join(t.split())
    return t[: n - 1] + "…" if len(t) > n else t


def scan_head(path: pathlib.Path):
    """앞부분에서 cwd·gitBranch·첫 실요청 추출."""
    cwd = branch = first = None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= HEAD_LINES or (cwd and first):
                    break
                if len(line) > MAX_JSON_LINE:
                    continue
                if cwd is None and '"cwd"' in line:
                    try:
                        cwd = json.loads(line).get("cwd") or None
                    except Exception:
                        pass
                if branch is None and '"gitBranch"' in line:
                    try:
                        branch = json.loads(line).get("gitBranch") or None
                    except Exception:
                        pass
                if first is None and '"type":"user"' in line.replace(" ", ""):
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    if d.get("type") != "user":
                        continue
                    t = text_of(d.get("message", {}).get("content"))
                    if is_real_prompt(t):
                        first = t
    except OSError:
        pass
    return cwd, branch, first


def scan_tail(path: pathlib.Path):
    """꼬리에서 마지막 실요청·마지막 worktree 언급 추출."""
    last_prompt = None
    wt_mention = None
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            if size > TAIL_BYTES:
                f.seek(size - TAIL_BYTES)
                f.readline()  # 잘린 첫 라인 버림
            data = f.read().decode("utf-8", errors="replace")
    except OSError:
        return None, None
    for m in re.finditer(r"\.claude/worktrees/([A-Za-z0-9._-]+)", data):
        wt_mention = m.group(1)
    for line in reversed(data.splitlines()):
        if len(line) > MAX_JSON_LINE or '"type":"user"' not in line.replace(" ", ""):
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("type") != "user":
            continue
        t = text_of(d.get("message", {}).get("content"))
        if is_real_prompt(t):
            last_prompt = t
            break
    return last_prompt, wt_mention


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    root = main_repo_root()
    main_slug = slugify(root)
    cutoff = datetime.datetime.now().timestamp() - args.days * 86400
    current = os.environ.get("CLAUDE_SESSION_ID", "")

    rows = []
    for d in session_dirs(main_slug):
        wt_from_dir = None
        if d.name != main_slug:
            wt_from_dir = d.name[len(main_slug + "--claude-worktrees-"):]
        for f in d.glob("*.jsonl"):
            st = f.stat()
            if st.st_mtime < cutoff:
                continue
            cwd, branch, first = scan_head(f)
            last_prompt, wt_mention = scan_tail(f)
            if not first and not last_prompt and not args.all:
                continue  # 빈 세션
            wt = wt_from_dir
            if wt is None and cwd and "/.claude/worktrees/" in cwd:
                wt = cwd.split("/.claude/worktrees/")[1].split("/")[0]
            label = wt or ("메인" + (f"→{wt_mention}" if wt_mention else ""))
            rows.append({
                "id": f.stem,
                "mtime": st.st_mtime,
                "label": label,
                "branch": branch or "",
                "first": clip(first or last_prompt or "(요청 없음)"),
                "cwd": cwd or str(root),
                "me": f.stem == current,
            })

    rows.sort(key=lambda r: r["mtime"], reverse=True)
    if not rows:
        print(f"최근 {args.days}일 내 세션이 없습니다.")
        return

    print(f"최근 {args.days}일 세션 {len(rows)}개 (최근 활동순):\n")
    for i, r in enumerate(rows, 1):
        ts = datetime.datetime.fromtimestamp(r["mtime"]).strftime("%m-%d %H:%M")
        me = " ← 현재 세션" if r["me"] else ""
        print(f"{i:>2}. [{ts}] {r['label']:<28} {r['first']}{me}")
        print(f"    id={r['id']}")
    print("\n복구 명령 (세션별로 새 터미널에 붙여넣기):")
    for i, r in enumerate(rows, 1):
        if r["me"]:
            continue
        print(f"# {i}. {r['label']}")
        print(f"cd '{r['cwd']}' && claude --resume {r['id']}")


if __name__ == "__main__":
    main()
