# Daily Note 되살리기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 화면 안에서 Daily Note(계획표 템플릿)를 바로 쓰고, 날짜를 옮겨 보고, 빠른 입력으로 오늘 노트에 한 줄을 덧붙인다.

**Architecture:** 템플릿·붙이기·찾기·날짜 문구 규칙을 `src/model/DailyNoteService.ts` 순수 함수로 두고 테스트한다. 컨트롤러는 선택을 바꾸지 않는 `ensureDailyNote`와 `appendToDailyNote`를 제공하고, 기존 `openOrCreateDailyNote`는 그 위에 선택만 더한다. 오늘 화면은 날짜 상태를 가지며, 기존 BlockEditor를 하단 패널 없이 띄우는 `EmbeddedNoteEditor`로 Daily Note를 편집한다.

**Tech Stack:** React 18, TypeScript, Mantine 7, BlockNote 0.55, Vitest

**Spec:** `docs/superpowers/specs/2026-11-13-daily-note-design.md`

## Global Constraints

- `Note`/`TodoMeta` 모델 변경 금지, 저장 구조 `Daily Note` → `YYYY-MM` → `YYYY-MM-DD` 유지.
- 날짜를 둘러보기만 해서는 Daily Note를 만들지 않는다. 오늘 화면에서 찾기·만들기는 노트 화면 선택·폴더를 바꾸지 않는다.
- `오늘 순서`는 번호 목록(numberedListItem) — 체크박스 금지.
- 템플릿 섹션 제목: `오늘 순서`, `주의할 점`, `메모` (H2).
- 새 UI 라이브러리 금지.

## Review Focus

1. 사용자가 `## 메모` 제목을 지운 Daily Note에 "오늘 노트" 붙이기 → 본문 끝에 `메모` 제목을 새로 만들고 붙여야 함 (Task 1 테스트).
2. 본문이 비었거나 블록 JSON이 아닌(옛 마크다운) Daily Note에 붙이기 → 예외 없이 메모 섹션 생성 (Task 1 테스트).
3. `메모` 아래에 또 다른 제목(`## 회고`)을 사용자가 추가한 경우 → 그 제목 앞, 메모 섹션 끝에 붙어야 함 (Task 1 테스트).
4. 오늘 할 일이 0개일 때 템플릿 → 빈 번호 항목 1개 (Task 1 테스트).
5. Daily Note를 오늘 화면에서 편집하는 중 빠른 입력으로 같은 노트에 붙이기 → 에디터에 바로 반영되고 입력 내용이 사라지지 않음 (Task 3 브라우저 확인).

---

### Task 1: Daily Note 규칙 모듈

**Files:** Create `src/model/DailyNoteService.ts`; Test `src/model/__tests__/DailyNoteService.test.ts`

**Interfaces (Produces):**
```ts
export const DAILY_SECTION = { order: '오늘 순서', caution: '주의할 점', memo: '메모' } as const;
export function isDailyNoteProject(p: Project): boolean; // 'daily note' | 'daily notes' | '데일리 노트' (대소문자 무시)
export function findDailyNote(notes: Note[], projects: Project[], dateIso: string): Note | undefined;
export function buildDailyNoteBlocks(taskTitles: string[]): Array<Record<string, unknown>>;
export function appendToDailyMemo(content: string, lines: string[]): string; // 블록 JSON 문자열 반환
export function formatDailyCaptureLine(text: string, now: Date): string; // "HH:MM 내용"
export function formatDashboardDateLabel(dateIso: string, todayIso: string): string;
```

- [ ] **Step 1: 실패하는 테스트**
  - `buildDailyNoteBlocks(['견적서 회신','보고서'])` → 블록 타입 순서 `heading(오늘 순서), numberedListItem×2, heading(주의할 점), bulletListItem(빈), heading(메모), paragraph(빈)`, 제목 level 2; `buildDailyNoteBlocks([])` → `오늘 순서` 아래 빈 numberedListItem 1개.
  - `appendToDailyMemo(템플릿, ['14:30 통화'])` → `메모` 다음의 빈 문단이 bulletListItem `14:30 통화`로 바뀜(빈 문단 대체); 다시 `['15:00 메일']` → 그 아래 하나 더.
  - 메모 뒤에 `heading(회고)`가 있으면 그 앞에 삽입.
  - `메모` 제목이 없으면 끝에 heading(메모) + 항목 추가; `''`·`'옛 마크다운'` 본문도 같은 결과(예외 없음).
  - `formatDailyCaptureLine(' 고객 통화 ', 2026-11-13 14:05)` → `'14:05 고객 통화'`.
  - `formatDashboardDateLabel('2026-11-13','2026-11-13')` → `'11월 13일 금요일'`; `'2026-11-12'` → `'11월 12일 목요일 (어제)'`; `'2026-11-14'` → `'11월 14일 토요일 (내일)'`; `'2026-11-20'` → `'11월 20일 금요일'`.
  - `findDailyNote`: Daily Note 폴더 안 제목 `2026-11-13` 노트를 찾고, 다른 폴더의 같은 제목은 무시.
- [ ] **Step 2:** `npx vitest run src/model/__tests__/DailyNoteService.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3:** 구현. 블록 텍스트는 인라인 배열 `[{type:'text',text,styles:{}}]`, 제목 비교는 텍스트 trim. 삽입 위치는 최상위 블록 배열 기준.
- [ ] **Step 4:** `npx vitest run` → 전체 PASS
- [ ] **Step 5:** 커밋 `feat: Daily Note 템플릿·메모 붙이기·날짜 문구 규칙`

### Task 2: 컨트롤러 — 선택을 바꾸지 않는 생성·붙이기, 템플릿 적용

**Files:** Modify `src/controller/NotesController.tsx`

**Interfaces:** Consumes Task 1 전부, `buildTaskItems`/`getTodayBoard`/`computeEffectivePlannerMap`. Produces (NotesActions):
```ts
ensureDailyNote(dateIso: string): string;          // 없으면 템플릿으로 생성, 선택·폴더 변경 없음
appendToDailyNote(lines: string[]): string;        // 실제 오늘 노트 메모 칸에 붙임(없으면 생성 후)
```
- [ ] **Step 1:** 내부 `upsertDailyNote(dateIso, transform?: (content: string) => string)` — 기존 `openOrCreateDailyNote`의 폴더·월 노트 생성 로직을 옮기고, 새 날짜 노트 본문 = `JSON.stringify(buildDailyNoteBlocks(그 날짜 getTodayBoard tasks 제목))`, `transform`이 있으면 적용. 기존 노트면 `notesRef` 최신 본문에 `transform` 적용 후 `updateContent`.
- [ ] **Step 2:** `openOrCreateDailyNote` = `upsertDailyNote` + 기존처럼 폴더·선택 이동(동작 유지). `ensureDailyNote` = `upsertDailyNote`만. `appendToDailyNote(lines)` = `upsertDailyNote(오늘, c => appendToDailyMemo(c, lines))`.
- [ ] **Step 3:** `npx tsc -b` → 오류 없음; 브라우저에서 모바일 "오늘노트" 탭(또는 노트 목록 날짜 노트 만들기)으로 새 날짜 노트 → 템플릿·미리 채우기 확인.
- [ ] **Step 4:** 커밋 `feat: Daily Note 템플릿 적용과 선택을 바꾸지 않는 생성·붙이기`

### Task 3: 오늘 화면 — 날짜 이동과 Daily Note 영역

**Files:** Create `src/view/DailyNotePanel.tsx`, `src/view/CalendarPicker.tsx`; Modify `src/view/TodayView.tsx`, `src/view/NoteEditorView.tsx`(`EmbeddedNoteEditor` 내보내기)

**Interfaces:** Consumes `ensureDailyNote`, `findDailyNote`, `formatDashboardDateLabel`, `getCalendarMatrix`. Produces `<EmbeddedNoteEditor noteId />`, `<CalendarPicker value onChange markedDates />`.

- [ ] **Step 1:** `EmbeddedNoteEditor({ noteId })`: 같은 파일의 BlockEditor를 `embedded` 모드로 렌더(하단 첨부·백링크 패널 숨김, 하단 여백 40px, 할일 상태 막대 없음 — Daily Note는 할일이 아님), `key={noteId}`.
- [ ] **Step 2:** `CalendarPicker`: `getCalendarMatrix` 재사용, 월 이동, 선택일 강조, `markedDates`(Daily Note 있는 날) 점 표시. 기존 `MiniCalendar`는 건드리지 않음.
- [ ] **Step 3:** `TodayView`: `viewDate` 상태(실제 오늘을 보고 있으면 자정에 따라감), 헤더 `‹ 날짜라벨 ›` + 오늘 아닐 때 `[오늘]` + `[달력]` 팝오버. `getTodayBoard(..., viewDate)`. "오늘 노트" 버튼 제거(영역으로 대체).
- [ ] **Step 4:** `DailyNotePanel({ dateIso })`: 노트 있으면 접기 헤더(`오늘 노트` 또는 `M월 D일 노트`) + "노트로 열기"(`openNote`) + 최대 높이 55vh 스크롤 영역 안 `EmbeddedNoteEditor`; 없으면 "이 날의 노트 시작하기"(`ensureDailyNote`). 접힘 상태 localStorage `bullsnote.today.dailyCollapsed`.
- [ ] **Step 5: 검증(브라우저 1280px):** 날짜 이동 시 세 영역+노트 전환, 노트 없는 날은 생성 안 됨, 시작하기 → 템플릿·순서 채움, 노트 화면 선택 불변, 편집 저장. `npx tsc -b`, `npx vitest run`.
- [ ] **Step 6:** 커밋 `feat: 오늘 화면 날짜 이동과 Daily Note 계획표 영역`

### Task 4: 빠른 입력 "오늘 노트"

**Files:** Modify `src/view/QuickCaptureModal.tsx`

- [ ] **Step 1:** 종류 `'todo' | 'note' | 'daily'`, 토글 3단, Tab 순환(todo→note→daily→todo). daily 저장 = `appendToDailyNote([formatDailyCaptureLine(text, now), ...메모 줄(비지 않은 줄)])`. daily일 때 날짜·시각 칩 숨김, 자리표시자 `오늘 노트 메모에 한 줄 추가`.
- [ ] **Step 2: 검증:** 오늘 화면에서 Daily Note를 펼친 채 ⌘N → 오늘 노트 → 저장 시 메모 칸에 즉시 표시, 노트 없을 때는 생성 후 붙음. 커밋 `feat: 빠른 입력에서 오늘 노트 메모에 덧붙이기`

### Task 5: 검증과 보고

- [ ] `npx vitest run`, `npx tsc -b`, `npx vite build` 통과, 모바일 375px "오늘노트" 탭 회귀 확인
- [ ] 전체 변경 자체 리뷰(Review Focus 5개 확인) 후 보고
