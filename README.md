# BullsNote — 크로스플랫폼 지식관리 & 할일 메모장 (Desktop & Mobile PWA)

Windows / macOS / Linux 데스크톱 앱 및 **iOS / iPadOS / Android 모바일·태블릿 PWA(Progressive Web App)** 멀티 플랫폼 지원. MVC 패턴 + 로컬 파일 볼트 + Google Drive 증분 동기화 + Google Calendar 모바일 푸시 알림 연동 지원.

---

## 🛠️ 기술 스택
- **Electron 32 + Vite 5 + React 18 + TypeScript**: Win/Linux/Mac 데스크톱 네이티브 패키징 (`electron-builder`) 및 웹 표준 **PWA(`manifest.webmanifest` + Service Worker)** 동시 지원.
- **Mantine 7 (MIT, 무료)**: 3단계 적응형(Desktop 3단 · Pad 2단 · Phone 1단+하단탭) 반응형 UI 컴포넌트, 다크/라이트 모드 테마.
- **BlockNote 0.55 + ariakit 스킨**: 노션식 블록 에디터, `/` 슬래시 메뉴(표·코드·이미지·파일), 드래그 앤 드롭 정렬.
- **Shiki 4 (MIT)**: 19개 언어 코드 블록 문법 강조 (라이트/다크 테마 동시 지원).
- **Google Drive Cloud Sync**: Google 계정 OAuth 로그인 및 **PC ↔ 모바일 원클릭 연동 코드(`BNM1:...`)**, Google Drive를 개인 DB 및 파일 스토리지로 무료(15GB) 활용, 노트 단위 증분 동기화(`index.json` + `notes/note_<id>.json` + `attachments/`).
- **Google Calendar Mobile Alarm Sync**: 노트 및 할일 알람 설정 시 Google Calendar 일정(10분 전 + 정각 모바일 팝업 알림, 반복 `RRULE`) 자동 연동.
- **Gemini AI**: 개인 Gemini API Key 기반 맞춤형 AI 어시스턴트 (클립보드 요약, 작성 보조 등).
- **Tabler Icons (MIT)**: 직관적인 아이콘 세트.

---

## 📁 MVC 아키텍처 매핑
```
src/model/      → M: Note.ts, TodoService.ts, GoogleDriveService.ts, GoogleCalendarService.ts (도메인+영속성+동기화)
src/view/       → V: SidebarView, NoteListView, NoteEditorView, GoogleSyncModal, ReminderPopover (표현 계층)
src/controller/ → C: NotesController.tsx (useNotes 컨텍스트, 상태 관리 및 액션)
electron/       → 데스크톱 셸 (main.js, preload.js, vault-ipc.js, google-auth-ipc.js, tray.js)
public/         → PWA 매니페스트(manifest.webmanifest), 오프라인 앱 쉘 서비스 워커(sw.js), 앱 아이콘
```

---

## ✨ 주요 기능
- **노트 & 프로젝트 관리**: 프로젝트별 폴더링, 트리 계층 구조(들여쓰기/내어쓰기), 핀/즐겨찾기, 7가지 파스텔 컬러 라벨.
- **블록 에디터 & 서식**:
  - `/` 명령어로 표, 코드, 이미지, 날짜 삽입
  - `@오늘`, `@내일` 동적 날짜 멘션 및 캘린더 피커
  - 마우스 우클릭 컨텍스트 메뉴(잘라내기/복사/붙여넣기/서식 없이 붙여넣기) 전면 지원
- **해시태그 자동 추출**: 제목과 본문에서 `#태그`를 실시간 수집 및 사이드바 필터링.
- **스냅샷 히스토리**: 편집 이력 자동 스냅샷(최대 30개) 보관 및 원클릭 복원.
- **인쇄 및 다양한 공유/내보내기**:
  - **문서 인쇄 (`Ctrl+P` / `Cmd+P`)**: A4 규격에 맞춘 전용 헤더 및 서식 최적화 인쇄 지원 (UI 숨김 처리).
  - **원클릭 PDF 내보내기**: Electron 네이티브 다이얼로그 연동으로 고품질 `.pdf` 파일 즉시 저장.
  - **클립보드 복사**: 마크다운(`.md`), 서식 유지 HTML(이메일/노션/워드용), 일반 텍스트 복사.
  - **파일 내보내기 및 OS 공유**: 마크다운 파일(`.md`), HTML 웹페이지(`.html`) 다운로드 및 시스템 공유 창 지원.
- **알람 & 리마인더 (모바일 푸시 알림 연동)**: 특정 날짜/시간 알림, 반복 알람(매일/평일/매주/매월), OS 시스템 알림창 연동 및 **Google Calendar 자동 동기화(모바일 기기에서 10분 전 + 정각 2회 푸시 알림)**.
- **할일 관리(Todo Board) & 체크리스트 양방향 연동**: 노트 내 체크리스트(`[]`)에서 하위 계층 구조 및 세부 내용을 포함한 할일 추출, `Done` 완료 시 원본 노트 체크박스(`[x]`) 자동 완료 처리 및 연결된 Google Calendar 알림 자동 해제.
- **클라우드 및 로컬 이중 저장소 지원**:
  1. **로컬 파일 볼트(Local File Vault)**: `내 문서/BullsNote` 폴더에 `.md` 마크다운 + frontmatter 형태로 파일 저장.
  2. **Google Drive 클라우드 동기화**: Google 계정 OAuth 연동으로 본인의 Google Drive를 무료 DB 및 첨부파일 스토리지로 활용. 동기화 폴링 주기를 설정에서 변경 가능.

---

## 📱 모바일(Phone) & 태블릿(Pad) PWA 사용 가이드

BullsNote는 별도의 네이티브 앱 빌드 도구(Xcode / Android Studio) 없이도 **웹 표준 PWA(Progressive Web App)**를 통해 스마트폰(iPhone, Galaxy)과 태블릿(iPad, Galaxy Tab)에서 앱처럼 설치해 사용할 수 있습니다.

### 1. 기기별 3단계 적응형(Adaptive) UX
- **스마트폰 (`< 768px`)**:
  - **1단 전체화면 뷰 + 하단 5탭 네비게이션 바**(`📁 폴더/메뉴` · `📝 노트목록` · `📋 할일관리` · `📅 오늘노트` · `➕ 새 노트`)로 한 손 조작에 최적화되어 있습니다.
  - 목록에서 노트를 탭하면 전체화면 에디터로 전환되며, 좌측 상단 **`[← 목록]`** 버튼이나 기기 뒤로가기 제스처로 목록으로 복귀합니다.
- **태블릿 / 패드 (`768px ~ 1080px`)**:
  - **2단 분할 화면(좌측 노트 목록 + 우측 에디터)**으로 동작하며, 좌측 상단 아이콘을 탭하면 **폴더 사이드바가 슬라이드 드로어(Drawer)**로 열립니다.
- **터치 친화적 제어 (`⋯` 퀵 액션 메뉴)**:
  - 마우스 호버나 드래그 앤 드랍 없이도 각 노트/할일 우측의 **`+`(하위 추가)** 및 **`⋯`(관리 메뉴)** 버튼을 탭하여 **할일 상태 변경(`To Do` / `Doing` / `Done` / `Drop`)**, **계층 이동(`들여쓰기` / `내어쓰기`)**, **폴더 이동**, **핀/즐겨찾기**, **삭제**를 모두 수행할 수 있습니다.

### 2. 모바일/패드에 PWA 앱 설치 및 실행 방법

#### 방법 A: GitHub Pages 정식 HTTPS 배포본으로 어디서나 접속 & 홈 화면 설치 (권장)
1. **GitHub Pages 활성화 (최초 1회)**:
   - GitHub 저장소의 **`Settings > Pages > Build and deployment > Source`**를 **`GitHub Actions`**로 설정합니다.
   - `main` 브랜치에 코드를 푸시하면 `.github/workflows/deploy-pwa.yml`이 자동 실행되어 `https://<GitHub계정>.github.io/bullsNote/` 주소로 배포됩니다.
2. **홈 화면에 앱 설치**:
   - **iOS / iPadOS (Safari)**: 배포 주소 접속 → **[공유(네모 위 화살표)]** 버튼 → **[홈 화면에 추가]** 탭
   - **Android (Chrome)**: 배포 주소 접속 → 우측 상단 메뉴(`⋮`) → **[앱 설치(홈 화면에 추가)]** 탭
   - 설치 후 바탕화면의 **BullsNote 아이콘**으로 실행하면 브라우저 주소창이 없는 **독립 실행형(Standalone) 전체화면 앱**으로 실행됩니다.

#### 방법 B: 로컬 Wi-Fi 개발 서버에서 즉시 확인 및 디버깅
1. 터미널에서 PWA 개발 서버를 실행합니다:
   ```bash
   npm run dev:pwa
   ```
2. PC와 동일한 Wi-Fi에 연결된 스마트폰/패드 브라우저에서 `http://<PC의_내부_IP>:5190` (예: `http://192.168.x.x:5190`)으로 접속합니다.
3. PC Chrome 브라우저에서는 `http://localhost:5190` 접속 후 **개발자 도구(`F12`) > 기기 툴바 토글(`Cmd+Shift+M` / `Ctrl+Shift+M`)**을 켜면 iPhone / iPad 해상도로 즉시 디버깅할 수 있습니다.

### 3. PC ↔ 모바일 원클릭 Google Drive 연동 (`BNM1:...` 연동 코드)
모바일에서 복잡한 Google Cloud 설정이나 긴 클라이언트 ID 입력 없이 **1초 만에 PC와 동일한 Google Drive 데이터를 연동**할 수 있습니다.
1. **PC 데스크톱 앱**: 좌측 하단(또는 상단) **`[Google Drive 동기화 설정]`** 모달을 열고 **`[모바일 연동 코드 복사]`** 버튼을 클릭합니다.
2. **모바일 / 패드 PWA**: 복사한 `BNM1:...` 코드를 모바일 로그인 화면의 **`[모바일/웹 원클릭 연동]`** 입력창에 붙여넣고 **`[원클릭 연동]`** 버튼을 탭합니다.
3. 즉시 Google Drive의 모든 폴더·노트·할일·첨부파일이 동기화되며, 이후 모바일에서도 토큰이 자동으로 갱신됩니다.

---

## 🚀 Git 기반 플랫폼별 릴리즈 (GitHub Actions 자동화)

GitHub Actions를 통해 태그를 푸시하면 **Windows(`.exe`), macOS(`.dmg`), Linux(`.AppImage`/`.deb`)** 설치 파일이 GitHub Release에 자동 빌드되어 게시됩니다.

### 1단계: 버전 업데이트 및 태그 생성 (권장)
`npm version` 명령어를 사용하면 `package.json`의 버전 번호 수정과 `Git 태그` 생성이 한 번에 처리됩니다:
```bash
# 패치 버전 증가 (0.1.0 -> 0.1.1 및 v0.1.1 태그 생성)
npm version patch

# 또는 마이너 버전 증가 (0.1.0 -> 0.2.0 및 v0.2.0 태그 생성)
# npm version minor

# 또는 특정 버전 직접 지정
# npm version 0.1.2
```

### 2단계: 메인 브랜치 및 태그 푸시
```bash
# 코드와 태그를 원격 저장소로 함께 푸시
git push origin main --tags
```

### 3단계: GitHub Release 확인
1. GitHub 저장소의 **Actions** 탭으로 이동하면 `Release BullsNote` 워크플로가 실행됩니다.
2. 약 3~5분 후 **Releases** 탭에 다음 배포 파일들이 자동으로 업로드됩니다:
   - **Windows**: `BullsNote Setup 0.1.0.exe` (설치형), `BullsNote 0.1.0.exe` (포터블 무설치)
   - **macOS**: `BullsNote-0.1.0.dmg`, `BullsNote-0.1.0-mac.zip`
   - **Linux**: `BullsNote-0.1.0.AppImage`, `bullsnote_0.1.0_amd64.deb`

> **참고**:
> - GitHub 저장소 설정(`Settings -> Actions -> General -> Workflow permissions`)에서 **Read and write permissions**가 활성화되어 있어야 릴리즈 산출물이 정상 등록됩니다.
> - **macOS 설치 시 주의사항**: 미공증 앱 특성상 Gatekeeper에 의해 `"손상되었기 때문에 열 수 없습니다"`라는 경고가 발생할 수 있습니다. 아래 [문제 해결](#-문제-해결-및-팁)의 격리 속성 제거 명령어로 해결할 수 있습니다.

---

## 💻 로컬 실행 및 수동 빌드

### 개발 서버 실행
```powershell
npm install
npm run dev            # Vite 개발 서버 + Electron 데스크톱 앱 동시 실행
npm run dev:pwa        # 웹/모바일 PWA 개발 서버 실행 (동일 Wi-Fi 모바일 기기 접속 지원: http://<IP>:5190)
npm run electron:dev   # Electron 데스크톱 앱 개발 모드 실행
```

### 로컬 패키징
```powershell
# 현재 OS용 자동 빌드
npm run dist

# Windows 전용 (NSIS 인스톨러 + Portable 단일 실행파일)
npm run dist:win

# Linux 전용 (WSL2 또는 Linux 환경 권장)
npm run dist:linux

# macOS 전용 (macOS 환경 필요)
npm run dist:mac
```

- 빌드 산출물은 프로젝트 루트의 `release/` 폴더에 생성됩니다.

---

## 🔧 문제 해결 및 팁
- **macOS "앱이 손상되었기 때문에 열 수 없습니다" 오류 (Gatekeeper 차단)**:
  Apple 개발자 인증서 미서명/미공증 앱을 인터넷(GitHub Release 등)에서 다운로드할 때 macOS 보안 정책(Gatekeeper)에 의해 격리(Quarantine) 플래그가 붙어 발생합니다. (파일이 실제로 손상된 것이 아닙니다)
  1. `BullsNote.app`을 `/Applications` (응용 프로그램) 폴더로 이동합니다.
  2. **터미널(Terminal)**을 실행하고 아래 명령어를 입력합니다:
     ```bash
     xattr -cr /Applications/BullsNote.app
     ```
  3. 이후 앱을 더블 클릭하여 실행하면 정상 실행됩니다.
  *(또는 '시스템 설정 > 개인정보 보호 및 보안 > 보안' 섹션에서 '확인 없이 열기'를 클릭하여 허용할 수도 있습니다)*
- **NSIS 캐시 오류**: Windows에서 NSIS 생성 시 오류가 발생하면 `%LOCALAPPDATA%\electron-builder\Cache\nsis` 폴더를 삭제 후 재시도하세요.
- **Electron 바이너리 다운로드 실패**: `npm install --ignore-scripts` 후 `node node_modules/electron/install.js`를 별도로 실행하세요.
- **Google Drive 및 Gemini CSP 정책**: Google Drive API 및 Gemini AI 통신은 `index.html`의 CSP 정책(`connect-src https: wss:`)에 허용되어 있습니다.
