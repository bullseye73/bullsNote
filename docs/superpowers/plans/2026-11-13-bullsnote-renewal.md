# BullsNote 리뉴얼(컨셉 B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱에서 "오늘 / 할일 / 노트" 구조, 로그인 없는 첫 실행, 빠른 입력, 체크리스트 단일 연결을 갖춘 배포용 BullsNote로 개편한다.

**Architecture:** 데이터 모델(할일 = `TODO_PROJECT_ID` 안의 노트 + `todoMeta`)은 그대로 두고, 판단 규칙(오늘 포함 기준·필터·빠른 입력 파서·OAuth 클라이언트 결정)을 `src/model/`의 순수 함수로 분리해 단위 테스트한다. 화면 전환은 컨트롤러에 `workspaceView`/`todoViewMode` 상태를 추가하고, 기존 `plannerViewActive`는 그 파생값으로 바꿔 모바일·기존 호출부 호환을 유지한다. 상세 보기는 공용 `DetailDrawer`(오른쪽 패널)로 통일한다.

**Tech Stack:** React 18, TypeScript, Mantine 7, BlockNote 0.55, Vite 5, Electron, Vitest(신규), qrcode(신규)

**Spec:** `docs/superpowers/specs/2026-11-12-bullsnote-renewal-design.md`

## Global Constraints

- 데이터 모델 변경 금지: `Note`, `TodoMeta` 필드 추가·변경 없음 (localStorage 키 추가만 허용).
- Mantine 유지, 새 UI 라이브러리 금지. 신규 의존성은 `vitest`(dev), `qrcode` + `@types/qrcode`만.
- 화면 문구는 한국어 단일 라벨 (영문 병기 제거). 한 화면의 채움색 강조 버튼은 하나.
- 모바일(<768px) 셸은 이번 범위 밖이며 기존 동작을 깨지 않는다.
- 범위 밖(스펙 8장 + 아래 "제외"): 권한 단계적 요청, MCP 할일 도구, 오늘 브리핑, AI 파싱, 마감 시각 필드, OS 전역 단축키, OAuth 앱 심사.
- **제외(스펙 6.3 권한 단계적 요청):** 실제 Google OAuth 앱과 실계정 없이 검증할 수 없고 기존 사용자 캘린더·Tasks 연동을 깨뜨릴 위험이 있어 이번 구현에서 제외하고 후속 과제로 넘긴다.

## Review Focus

1. 할일이 하나도 없는 상태 / 마감일 없는 할일만 있는 상태 → 오늘 화면은 빈 상태 안내를 보여야 하고 예외가 나면 안 된다 (Task 1 테스트).
2. 빠른 입력에 날짜·시각이 전혀 없거나 `#`만 있는 입력 → 제목 원문 그대로 노트로 저장, 빈 태그 생성 금지 (Task 1 테스트).
3. "3시"처럼 오전/오후 없는 시각 → 1~7시는 오후로 해석 (Task 1 테스트로 고정).
4. 기존 사용자(이미 Google 연결됨 또는 이미 로컬 사용 중)가 업데이트 후 환영 화면에 갇히지 않아야 한다 (Task 2 검증).
5. 내장 OAuth 클라이언트가 빌드에 없을 때 "Google로 계속"이 오류 대신 고급 입력으로 안내해야 한다 (Task 1 테스트 + Task 2 검증).

---

### Task 1: 테스트 도구 + 순수 규칙 모듈

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Create: `src/model/TaskQueryService.ts`, `src/model/QuickCaptureParser.ts`, `src/model/oauthClient.ts`
- Test: `src/model/__tests__/TaskQueryService.test.ts`, `src/model/__tests__/QuickCaptureParser.test.ts`, `src/model/__tests__/oauthClient.test.ts`

**Interfaces (Produces):**
```ts
// TaskQueryService.ts
export interface TaskItem { note: Note; status: TodoStatus; startDate: string | null; dueDate: string | null; sourceNoteId: string | null; sourceProjectId: string | null; }
export function buildTaskItems(notes: Note[], scheduleMap: Map<string, EffectiveTaskSchedule>): TaskItem[]; // 명시/롤업 일정만 날짜로 인정
export interface TodayBoard { tasks: TaskItem[]; schedule: Array<{ at: number; note: Note; label: string }>; ongoing: TaskItem[]; counts: { tasks: number; doing: number; overdue: number }; }
export function getTodayBoard(items: TaskItem[], notes: Note[], todayIso: string): TodayBoard;
export type PeriodFilter = 'all' | 'overdue' | 'thisWeek' | 'noDate';
export interface TaskFilter { statuses: TodoStatus[]; period: PeriodFilter; projectId: string | null; tag: string | null; }
export const DEFAULT_TASK_FILTER: TaskFilter;
export function filterTasks(items: TaskItem[], f: TaskFilter, todayIso: string): TaskItem[];
export function getBodyPreview(content: string, maxLen?: number): string;
export function getChecklistProgress(content: string): { done: number; total: number } | null;
// QuickCaptureParser.ts
export interface QuickCaptureResult { title: string; dueDate: string | null; time: string | null; tags: string[]; kind: 'todo' | 'note'; }
export function parseQuickCapture(text: string, now: Date): QuickCaptureResult;
// oauthClient.ts
export function resolveOAuthClient(cfg: { customClientId?: string; customClientSecret?: string }, env: { VITE_GOOGLE_CLIENT_ID?: string; VITE_GOOGLE_CLIENT_SECRET?: string }): { clientId: string; clientSecret: string; source: 'custom' | 'builtin' | 'none' };
```

- [ ] **Step 1: 실패하는 테스트 작성** (today = `2026-11-12`)
  - `getTodayBoard`: 마감 11/11 미완료 → `tasks[0]`, `counts.overdue === 1`; 마감 11/12 → 포함; 상태 doing·마감 11/20 → 포함; 완료(done)·마감 11/12 → 제외; 날짜 없는 todo → 제외; 시작 11/10·마감 11/20 → `ongoing` 포함; 알림 `targetAt` 오늘 14:00·dismissed false 노트 → `schedule` 포함, 어제 알림 → 제외; 할일 0개 → 모든 배열 빈 값.
  - `filterTasks`: `period:'overdue'` → 마감 < 오늘 && 미완료만; `'thisWeek'` → 11/9(월)~11/15(일); `'noDate'` → `dueDate === null`; `statuses:['done']` → 완료만; `tag:'업무'` → 할일 또는 출처 노트 태그에 업무 포함.
  - `getBodyPreview`: 블록 JSON 본문 첫 비어있지 않은 문단, 80자 초과 시 `…`; 빈 본문 → `''`.
  - `getChecklistProgress`: 체크 1/3 → `{done:1,total:3}`; 체크리스트 없음 → `null`.
  - `parseQuickCapture('내일 3시 견적서 회신 #업무', 2026-11-12 10:00)` → `{title:'견적서 회신', dueDate:'2026-11-13', time:'15:00', tags:['업무'], kind:'todo'}`; `'오전 9시 보고'` → time `'09:00'`, dueDate 오늘; `'11/20 발표'` → `'2026-11-20'`; `'금요일 정리'` → `'2026-11-13'`(다음 금요일, 오늘이 목요일); `'14:30 회의'` → `'14:30'`; `'아이디어 메모'` → `{dueDate:null,time:null,kind:'note',title:'아이디어 메모'}`; `'# 제목'` → `tags:[]`, title `'# 제목'`.
  - `resolveOAuthClient`: custom 있으면 `'custom'`; custom 없고 env 있으면 `'builtin'`; 둘 다 없으면 `'none'`.
- [ ] **Step 2:** `npm i -D vitest` 후 `npx vitest run` → FAIL (모듈 없음)
- [ ] **Step 3:** 세 모듈 구현. 날짜는 `PlannerService`의 `toIsoDateLocal`/`addCalendarDays`/`diffCalendarDays`, 본문은 `HashtagService`의 `parseBlocks`/`noteBodyText` 재사용. 시각만 있고 날짜가 없으면 오늘로 둔다.
- [ ] **Step 4:** `npx vitest run` → PASS, `npx tsc -b` → 오류 없음
- [ ] **Step 5:** 커밋 `feat: 오늘·필터·빠른 입력·OAuth 결정 규칙 모듈과 Vitest 추가`

### Task 2: 첫 실행·동기화 흐름

**Files:**
- Create: `src/view/WelcomeView.tsx`, `src/view/SyncStatusRow.tsx`
- Modify: `src/controller/NotesController.tsx` (`guestMode` localStorage 지속 `bullsnote.localMode`, `startLocal()` = 지속 + 예시 할일 3개 보장), `src/model/GoogleDriveService.ts` (login/refresh에 `resolveOAuthClient` 사용), `src/App.tsx` (LoginView → WelcomeView), `src/view/GoogleSyncModal.tsx` (미연결 시 "Google로 계속" + 고급 입력 접기, 연결 코드 QR), `package.json` (`qrcode`)

**Interfaces:** Consumes `resolveOAuthClient`. Produces `startLocal(): void`(NotesActions), `<SyncStatusRow />`(사이드바 하단).

- [ ] **Step 1:** 환영 화면: 제목 "노트와 할일을 한곳에", 설명 "데이터는 이 기기와 내 Google Drive에만 저장돼요", 주 버튼 "바로 시작하기"(`startLocal`), 보조 버튼 "다른 기기에서 쓰던 데이터 불러오기"(기존 `LoginView` 표시 + 뒤로 버튼).
- [ ] **Step 2:** 예시 할일 3개(오늘 마감 1, 내일 마감 1, 오늘~+5일 기간 1)는 할일이 하나도 없을 때만 생성.
- [ ] **Step 3:** `SyncStatusRow` 문구: 미연결 `이 기기에 저장됨 · 동기화`, 동기화 중 `동기화 중`, 연결됨 `동기화됨 · N분 전`; 클릭 시 `openGoogleSyncModal`.
- [ ] **Step 4:** 동기화 모달 미연결 상태: 안내 3줄 + "Google로 계속"(내장 클라이언트 있으면 바로 `loginGoogle`, 없으면 고급 입력 펼침) + "고급: 내 OAuth 클라이언트 사용" 접기. 연결 코드 옆 QR 이미지(`qrcode.toDataURL`).
- [ ] **Step 5: 검증:** 브라우저에서 localStorage 비운 상태 → 환영 화면 → 바로 시작 → 새로고침 후에도 환영 화면 안 뜸. 기존 `googleConnected` 사용자는 환영 화면 없이 진입. `npx tsc -b`, `npx vitest run` 통과.
- [ ] **Step 6:** 커밋 `feat: 로그인 없는 첫 실행, 동기화 상태 표시, Google로 계속·QR 연결`

### Task 3: 작업 공간 상태 + 사이드바 + 할일 화면 통합

**Files:**
- Modify: `src/controller/NotesController.tsx` (`workspaceView: 'today'|'todos'|'notes'` 기본 `'today'`, `todoViewMode: 'list'|'board'|'timeline'` localStorage `bullsnote.todoViewMode`, `openToday()`, `openTodos(mode?)`, `plannerViewActive` = `workspaceView==='todos' && todoViewMode==='timeline'`; `openPlannerView` = `openTodos('timeline')`, `closePlannerView`/`selectProject` → `'notes'`)
- Create: `src/view/DetailDrawer.tsx`, `src/view/todos/TodosView.tsx`, `src/view/todos/TaskCard.tsx`, `src/view/todos/TodoListView.tsx`, `src/view/todos/TodoBoardView.tsx`, `src/view/todos/TaskFilterBar.tsx`
- Modify: `src/view/SidebarView.tsx` (상단: 빠른 입력·검색·오늘·할일 / 노트: 즐겨찾기·폴더·태그 / 하단: `SyncStatusRow`, 달력 팝오버·Daily Notes·Gemini·할일관리·플래너 항목 제거), `src/App.tsx` (데스크톱 메인: workspaceView 분기), `src/view/PlannerView.tsx` (자체 드로어 → `DetailDrawer`, 영문 병기 라벨 정리)

**Interfaces:** Consumes Task 1 `buildTaskItems`, `filterTasks`, `getBodyPreview`, `getChecklistProgress`. Produces `<DetailDrawer noteId opened onClose />`, `<TaskCard item onOpen compact? />`, `openToday()`, `openTodos(mode?)`.

- [ ] **Step 1:** 컨트롤러 상태·액션 추가, 기존 호출부(`openPlannerView`, `closePlannerView`, `selectProject`, 모바일 탭)가 그대로 동작하는지 `npx tsc -b`.
- [ ] **Step 2:** `TaskCard`: 상태 아이콘(클릭 시 대기↔완료), 제목, 마감 배지(`getDueDateBadgeInfo` 재사용), 미리보기 1줄, 체크리스트 진행률, 출처 노트 링크.
- [ ] **Step 3:** `TodosView` 헤더: 제목 "할일", 보기 전환 `목록 / 보드 / 타임라인`, 인라인 "할일 추가"(Task 1 파서 → `createPlannerTask` + 알림), `TaskFilterBar`(상태·기간·폴더·태그, localStorage `bullsnote.taskFilter`). 목록 = 마감일순 카드, 보드 = 상태 4열, 타임라인 = `PlannerView`.
- [ ] **Step 4:** 사이드바 재구성, App 데스크톱 분기(오늘 = Task 4 자리 placeholder 없이 Task 4와 함께 연결).
- [ ] **Step 5: 검증:** 브라우저 1280px에서 할일 3보기 전환, 필터 동작, 카드 클릭 → 오른쪽 상세 패널, 타임라인 드래그·상세 정상. `npx tsc -b`, `npx vitest run`.
- [ ] **Step 6:** 커밋 `feat: 사이드바 오늘·할일·노트 구조와 할일 화면 통합(목록·보드·타임라인)`

### Task 4: 오늘 대시보드

**Files:** Create `src/view/TodayView.tsx`; Modify `src/App.tsx`
**Interfaces:** Consumes `getTodayBoard`, `TaskCard`, `DetailDrawer`, `openOrCreateDailyNote`.

- [ ] **Step 1:** 헤더 `M월 D일 요일 · 할 일 N · 진행 중 N · 지연 N` + "오늘 노트" 버튼. 왼쪽 "오늘 할 일"(TaskCard, 지연 강조), 오른쪽 "오늘 일정"(시간 축 + 현재 시각 선, 1분마다 갱신), "진행 중인 기간 작업"(D-day + 경과 막대).
- [ ] **Step 2:** 빈 상태: "오늘 할 일이 없어요" + "할일 추가" 버튼(빠른 입력 열기).
- [ ] **Step 3: 검증:** 예시 할일로 세 영역 표시, 할일 0개에서 빈 상태, 카드 클릭 → 상세 패널. 커밋 `feat: 오늘 대시보드`

### Task 5: 빠른 입력 + 체크리스트 단일 연결 + AI 진입점

**Files:**
- Create: `src/view/QuickCaptureModal.tsx`, `src/view/ChecklistTodoOverlay.tsx`
- Modify: `src/controller/NotesController.tsx` (`quickCaptureOpened`, `openQuickCapture(initialText?)`, `closeQuickCapture`), `src/App.tsx` (⌘N → 빠른 입력, ⌘J → 클립보드 붙여넣기 상태로 빠른 입력, 헤더 AI 버튼 제거), `src/view/NoteEditorView.tsx` (오버레이 장착), `src/view/EditorToolbar.tsx` (키 없으면 "AI 켜기"), `src/model/GeminiService.ts` (`isConfigured()`)

- [ ] **Step 1:** 빠른 입력: 할일/노트 토글(Tab), 실시간 칩(마감·알림·태그), Enter 저장, ⇧Enter 메모 영역. 할일 = `createPlannerTask({title, dueDate, startDate:dueDate})` + 시각 있으면 `setReminder`; 노트 = `createNoteFromGemini({title, markdown})`. 200자 이상이면 "AI로 정리"(키 있을 때만) → `GeminiService` 요약 → 노트 저장.
- [ ] **Step 2:** 체크리스트 오버레이: 각 `checkListItem` 블록 오른쪽에 연결된 할일이면 상태 배지(`할일 · M/D`/`완료`, 클릭 시 상세), 아니면 "+ 할일로"(`extractChecklistFromBlocks`에서 해당 blockId 항목만 `createTodosFromChecklist`).
- [ ] **Step 3:** AI opt-in: `GeminiService.isConfigured()`가 false면 서식 막대 AI 메뉴 자리에 "AI 켜기" → `openGeminiModal('settings')`.
- [ ] **Step 4: 검증:** 빠른 입력 예문 4개 저장 결과, 체크박스 "+ 할일로" → 배지 전환 → 할일 화면에 출처 표시, 완료 양방향. 커밋 `feat: 빠른 입력, 체크리스트 단일 할일 연결, AI 진입점 정리`

### Task 6: 전체 검증과 보고

- [ ] `npx vitest run`, `npx tsc -b`, `npx vite build` 통과
- [ ] 데스크톱 1280px·모바일 375px 브라우저 확인(모바일 회귀 없음)
- [ ] `superpowers:requesting-code-review`로 전체 변경 리뷰 후 지적 반영
- [ ] 크게 바뀐 내용 표 보고
