# 테니스 분석·대시보드 대개편 — 2단계 (대시보드 신설) 설계

- 날짜: 2026-08-13
- 대상: 몽피스(테니스). 대개편 3단계 중 **2단계**.
- 브랜치/워크트리: `tennis-dashboard` (base = main `bdeac42`)
- 선행: 1단계 완료(탭 재편·분석 뷰 전환·컬럼 정렬, main 반영). tdash 탭은 현재 `대시보드 · beta` placeholder.

## 1. 배경

1단계에서 홈 탭을 `대시보드(beta)·분석·경기관리·회원관리(beta)`로 재편하고 `tdash`(대시보드) 탭을 placeholder로 뒀다. 2단계는 이 placeholder를 **클럽 개요 대시보드**로 채운다. 분석 탭의 계산기를 재사용하며, 신규 계산기는 "클럽 이번달 요약" 하나뿐이다.

## 2. 범위

- **포함**: 대시보드 콘텐츠(요약·순위 TOP5·케미 TOP5·하이라이트), 신규 `buildMonthSummary` 계산기, 대시보드 탭 **beta 배지 제거**.
- **제외(후속)**: 3단계 날짜 필터, 회원관리 실기능(회원관리 탭 beta는 **유지**).
- **무변경**: 분석 계산 유틸(`tennisAnalytics.js`/`tennisStandings.js`) 로직, 분석·경기관리·회원관리 탭, 풋살/축구 전부.

## 3. 결정 (2026-08-13 유저)

| 항목 | 결정 |
|---|---|
| 요약 카드 | **클럽 이번달 요약(비개인)** — 경기 기록수·최다 출전·핫플레이어 |
| 복식/단식 순위 | **둘 다 동시 표시**(세로) |
| 인터랙션 | **비인터랙티브(정적 개요)** — 카드 클릭 네비게이션 없음, 표 정렬 없음 |
| TOP N | **TOP 5** |
| 기본 진입 탭 | **분석 유지**(스포츠 전환 리셋 로직 재수정 회피, 대시보드-우선 착지는 후순위) |
| beta 배지 | **대시보드 탭에서 제거**(실콘텐츠 확보). 회원관리는 placeholder라 beta 유지 |

## 4. 설계

### 4.1 신규 계산기 — `src/utils/tennis/tennisDashboard.js` `buildMonthSummary({ rows, month })`

`month`은 `'YYYY-MM'`. 순수 함수(Date 의존 없음 — 월은 호출부가 주입).

```js
export function buildMonthSummary({ rows, month }) {
  const inMonth = (rows || []).filter(r => (r.date || '').slice(0, 7) === month);
  const matches = new Set(inMonth.map(r => r.match_id).filter(Boolean)).size;

  const perPlayer = new Map();               // 회원(비게스트)만
  for (const r of inMonth) {
    if (r.is_guest === true || !r.player) continue;
    const c = perPlayer.get(r.player) || { name: r.player, games: 0, wins: 0 };
    c.games++;
    if (r.result === '승') c.wins++;
    perPlayer.set(r.player, c);
  }
  const players = [...perPlayer.values()];
  const topAttender = players.slice()
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ko'))[0] || null;
  const hotPlayer = players
    .filter(p => p.games >= 3)
    .map(p => ({ ...p, rate: p.games ? p.wins / p.games : 0 }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games)[0] || null;

  return { month, matches, topAttender, hotPlayer, playerCount: players.length };
}
```

- **경기 기록수**(`matches`): 이달 distinct `match_id`(복식·단식 통합).
- **최다 출전**(`topAttender`): 이달 최다 참여 회원(게스트 제외), 동수는 이름 오름.
- **핫플레이어**(`hotPlayer`): 이달 승률 최고 회원(**최소 3경기**), 없으면 `null`.
- 근거 필드: 행에 `date`(YYYY-MM-DD)·`match_id`·`is_guest`·`player`·`result` 존재 확인됨(`buildPairChemistry`/`buildPartnerBreakdown`가 동일 필드 사용).

### 4.2 대시보드 컴포넌트 — `src/components/tennis/TennisDashboard.jsx`

분석 탭과 동일한 데이터 로드(`TennisSync.getPlayerGames()` + `getRoster()`), 정적 렌더.

**월 선택(호출부)**:
```js
const months = [...new Set((rows || []).map(r => (r.date || '').slice(0, 7)).filter(Boolean))].sort();
const now = new Date();  // 브라우저 — Date 사용 가능
const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const targetMonth = months.includes(curMonth) ? curMonth : (months[months.length - 1] || curMonth);
const summary = useMemo(() => buildMonthSummary({ rows, month: targetMonth }), [rows, targetMonth]);
```

**섹션(위→아래):**
1. **이번달 요약 카드**: 타이틀 `{targetMonth} 요약`(현재월 아니면 그 월 라벨). StatCell 재사용 — 경기수 `summary.matches`, 최다출전 `summary.topAttender?.name (games)`, 핫플레이어 `summary.hotPlayer?.name (pct)`. 값 없으면 `-`.
2. **복식 순위 TOP 5** + **단식 순위 TOP 5**: `buildDoublesStandings({rows, roster}).slice(0,5)`, `buildSinglesStandings({rows, roster, asOfDate: today}).slice(0,5)`. 정적 표(기존 순위표 마크업 재사용하되 **SortHeader 없이 일반 `<th>`**). 각 섹션 타이틀 `복식 순위 TOP 5`·`단식 순위 TOP 5`.
3. **페어 케미 TOP 5**: `buildPairChemistry({rows}).slice(0,5)`. 정적 표(페어·전적·승률).
4. **하이라이트**: `buildTbRanking`/`buildBagelRanking`/`buildAceDfRanking`(format 미지정=전체) 각 상위 1~3을 컴팩트 카드로. 예: `타이브레이크 1위 홍길동 12/15`, `베이글 1위 …`, `에이스 1위 …`. 데이터 없으면 해당 줄 `-`.

- 정적 표라 `useSortableRows`/`SortHeader` **미사용**(비인터랙티브). 셀 렌더·스타일은 분석 표와 동일 톤(`ds.card`/`ds.th`/`ds.td()`).
- 빈 데이터: 각 섹션 `데이터 없음`/`-` graceful.

### 4.3 tdash 분기 배선 — `src/components/tennis/TennisTabs.jsx`

`if (activeTab === 'tdash') return <div>대시보드 · beta</div>;` → `if (activeTab === 'tdash') return <TennisDashboard C={C} />;`. `members`·`records`·`games`·fallback 무변경.

### 4.4 beta 배지 제거(대시보드만) — `src/components/dashboard/mainTabs.js`

테니스 탭 배열의 `{ key: 'tdash', label: '대시보드', beta: true }` → `{ key: 'tdash', label: '대시보드' }`. **`members`의 `beta: true`는 유지**. 비테니스 무변경.

### 4.5 무손상

- 공유 `mainTabs.js`: 테니스 tdash 항목의 beta만 제거, 비테니스 배열·members beta 무변경(1단계 회귀 유닛 `mainTabs.test.js`가 감시 — tdash beta 단언은 갱신 필요).
- 계산 유틸 로직 무변경(신규 파일만 추가). 풋살/축구 무영향.
- 상태·동기화·시트·Apps Script 무변경.

## 5. 테스트

- **`buildMonthSummary` 순수 유닛**: 이달 필터(match_id distinct)·게스트 제외·최다출전 동수 타이브레이크·핫플레이어 min3 가드(없으면 null)·빈 rows(matches 0, null들).
- **`mainTabs.test.js` 갱신**: 테니스 tdash에 `beta` 없음(`!x.beta`), members는 여전히 beta. 비테니스 회귀 단언 유지.
- **대시보드 렌더 스모크**(`renderToStaticMarkup` + ThemeProvider harness, TennisSync mock): 빈 데이터에서 크래시 없이 렌더, 섹션 타이틀(`복식 순위 TOP 5` 등) 존재.
- 전체 스위트(현재 1041) 통과 유지 + 신규.

## 6. 하위 호환·리스크

- 대시보드 beta 제거로 `mainTabs.test.js`의 tdash beta 단언이 깨짐 → 테스트도 함께 갱신(계획에 포함).
- 기본 진입 탭은 분석 유지 → 대시보드는 첫 탭이지만 기본 선택 아님(1단계와 동일, 의도).
- `buildMonthSummary`는 `match_id` 없는 레거시 행에선 경기수 과소집계 가능(distinct 대상에서 빠짐) — 요약은 개요 지표라 허용, 정확 집계는 순위표가 담당.
