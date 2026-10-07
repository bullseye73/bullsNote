# BullsNote — PC 지식관리 메모장 (Notion-like + 해시태그)

Windows / Linux / macOS 멀티 플랫폼 지원. MVC 패턴 + 로컬 파일 볼트 + Supabase 클라우드 동기화 지원.

---

## 🛠️ 기술 스택
- **Electron 32 + Vite 5 + React 18 + TypeScript**: Win/Linux/Mac 크로스플랫폼 네이티브 패키징 (`electron-builder`).
- **Mantine 7 (MIT, 무료)**: 반응형 UI 컴포넌트, AppShell 레이아웃, 다크/라이트 모드 테마.
- **BlockNote 0.55 + ariakit 스킨**: 노션식 블록 에디터, `/` 슬래시 메뉴(표·코드·이미지·파일), 드래그 앤 드롭 정렬.
- **Shiki 4 (MIT)**: 19개 언어 코드 블록 문법 강조 (라이트/다크 테마 동시 지원).
- **Supabase Cloud Sync**: 로컬-클라우드 양방향 증분 동기화, 오프라인 퍼스트, 유휴 시 0-트래픽 최적화.
- **Tabler Icons (MIT)**: 직관적인 아이콘 세트.

---

## 📁 MVC 아키텍처 매핑
```
src/model/      → M: Note.ts, HashtagService.ts, NoteRepository.ts, SupabaseService.ts (도메인+영속성+동기화)
src/view/       → V: SidebarView, NoteListView, NoteEditorView, SupabaseSettingsModal, ErrorBoundary (표현 계층)
src/controller/ → C: NotesController.tsx (useNotes 컨텍스트, 상태 관리 및 액션)
electron/       → 데스크톱 셸 (main.js, preload.js, vault-ipc.js, tray.js)
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
- **알람 & 리마인더**: 특정 날짜/시간 알림, 반복 알람(매일/평일/매주/매월), OS 시스템 알림창 및 트레이 연동.
- **이중 저장소 지원**:
  1. **로컬 파일 볼트(Local File Vault)**: `내 문서/BullsNote` 폴더에 `.md` 마크다운 + frontmatter 형태로 파일 저장 (OneDrive/Dropbox 연동 가능).
  2. **Supabase 클라우드 동기화**: 프로젝트 URL과 Anon Key 입력만으로 클라우드 양방향 동기화. 변경 시에만 가볍게 증분 전송되며 평상시 통신이 전혀 없는 초경량 아키텍처.

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

> **참고**: GitHub 저장소 설정(`Settings -> Actions -> General -> Workflow permissions`)에서 **Read and write permissions**가 활성화되어 있어야 릴리즈 산출물이 정상 등록됩니다.

---

## 💻 로컬 실행 및 수동 빌드

### 개발 서버 실행
```powershell
npm install
npm run dev            # 웹 브라우저 미리보기 (http://localhost:5190)
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
- **NSIS 캐시 오류**: Windows에서 NSIS 생성 시 오류가 발생하면 `%LOCALAPPDATA%\electron-builder\Cache\nsis` 폴더를 삭제 후 재시도하세요.
- **Electron 바이너리 다운로드 실패**: `npm install --ignore-scripts` 후 `node node_modules/electron/install.js`를 별도로 실행하세요.
- **Supabase CSP 오류 해결**: Supabase 통신은 `index.html`의 CSP 정책(`connect-src https: wss:`)에 허용되어 있습니다.
