# BullsNote — PC 지식관리 메모장 (Notion-like + 해시태그)

Windows / Linux / macOS 빌드 지원. MVC 패턴 + 무료 UX 프레임워크 적용.

## 기술 스택 (선정 이유)
- **Electron 32 + Vite 5 + React 18 + TypeScript**: Win/Linux/Mac 네이티브 패키징(`electron-builder`)이 가장 성숙. 웹 기술로 한 번 작성해 3 OS 빌드.
- **Mantine 7 (MIT, 무료)**: 깔끔하고 동적 UI에 최적화. AppShell/레이아웃, 다크모드 제공.
- **BlockNote 0.55 + ariakit 스킨 (MIT, 노션식 블록 에디터)**: `/` 블록 메뉴(표·코드·이미지·파일), 언어별 코드블록(json/shell 등), 이미지 붙여넣기, 드래그 정렬, 다크모드 지원.
- **Shiki 4 (MIT)**: 코드 블록 문법강조. 라이트/다크 테마 동시 지원.
- **Tabler Icons (MIT)**: 무료 아이콘.

## MVC 매핑
```
src/model/      → M: Note.ts, HashtagService.ts, NoteRepository.ts (도메인+영속성)
src/view/       → V: SidebarView, NoteListView, NoteEditorView, ErrorBoundary (표현만, 로직 없음)
src/controller/ → C: NotesController.tsx (useNotes 컨텍스트, CRUD/검색/필터/가져오기)
electron/       → 데스크톱 셸 (main.js, preload.js)
```

## 기능
- 노트 CRUD, 복제, 핀/즐겨찾기, 자동 updatedAt 정렬
- **트리 구조**: 하위 노트 추가, 펼치기/접기, 들여쓰기/내어쓰기로 계층 관리 (노션식 페이지 트리)
- **블록 편집**: `/` 입력으로 표·코드(json/shell 등 언어 선택)·이미지 붙여넣기·파일 삽입, 코드 블록 문법강조(Shiki, 라이트/다크 대응 19개 언어), 드래그 순서 변경, 상단 빠른편집 툴바(실행취소/서식/색상/제목/목록/표·이미지 삽입/Markdown 복사), 글자 수 표시
- **히스토리**: 노트별 자동 스냅샷(최대 30개), 시점 복원 (복원 시 현재 상태도 저장됨)
- 해시태그: 제목+본문에서 `#태그` 자동 추출 (한글 지원), 태그별 카운트, 클릭 필터, 뱃지 표시
- 검색: 제목/본문/태그 통합, 즐겨찾기만 보기
- 영속성: **파일 볼트**(문서/BullsNote, Markdown+frontmatter, 이미지 assets/ 분리, 히스토리 .bullsnote.json). 저장 폴더를 OneDrive/Dropbox 안으로 지정하면 기기 간 동기화. 외부 변경은 포커스/8초 폴링으로 감지·병합
- 단축키: `Ctrl+N` 새 노트

## 실행
```powershell
npm install
npm run dev            # 웹 미리보기 (http://localhost:5190)
npm run electron:dev   # Electron으로 실행
npm run dist           # 현재 OS용 패키지
npm run dist:win       # Windows nsis/portable
npm run dist:linux     # AppImage/deb (리눅스 또는 CI)
npm run dist:mac       # dmg/zip (macOS에서 실행)
```

> Linux/Mac 빌드는 각 OS 또는 CI(GitHub Actions)에서 실행 권장. `electron-builder --win --linux --mac` 멀티타깃 가능.
>
> 검증됨: Windows 무설치 폴더(`--dir`, `dist/win-unpacked/BullsNote.exe`) 패키징 성공.
> NSIS 인스톨러 생성 시 makensis 플러그인 오류가 나면 electron-builder 캐시
> (`%LOCALAPPDATA%\electron-builder\Cache\nsis`)를 지우고 재시도.

## 문제 해결
- `npm install` 중 Electron postinstall이 실패하면: `npm install --ignore-scripts` 후
  `node node_modules/electron/install.js` 로 바이너리만 별도 다운로드.
- 프로덕션 번들 확인: `npx vite preview` 후 http://localhost:4173 접속.
