# BullsNote Clipper & Sidekick — Chrome Web Store Listing & Privacy Policy

## Store Listing Summary
- **Name**: BullsNote Clipper & Sidekick
- **Category**: Productivity
- **Summary**: 웹 페이지, 선택한 텍스트, AI 요약 및 액션 아이템을 로컬에서 실행 중인 BullsNote 데스크톱 앱으로 즉시 저장하는 로컬 우선(Local-First) 웹 클리퍼입니다.

## Single Purpose Description
사용자가 현재 보고 있는 웹 페이지의 제목, URL, 선택 텍스트 또는 요약본을 로컬 PC에서 실행 중인 BullsNote 앱(`127.0.0.1:41905`)의 노트, 할일, Daily Note로 전송합니다.

## Permission Justifications
| Permission | Justification |
| --- | --- |
| `activeTab` | 사용자가 팝업/사이드패널/컨텍스트 메뉴를 통해 클립을 요청한 현재 활성 탭의 제목과 URL을 읽기 위해 사용합니다. |
| `scripting` | 사용자가 클립을 실행할 때 현재 탭에서 선택한 텍스트(`window.getSelection()`)와 본문 텍스트를 추출하기 위해 사용합니다. 백그라운드에서 임의의 페이지를 수집하지 않습니다. |
| `contextMenus` | 웹 페이지나 텍스트 선택 후 우클릭 메뉴("BullsNote 노트로 저장", "BullsNote 할일로 추가")를 제공하기 위해 사용합니다. |
| `storage` | BullsNote 데스크톱 앱이 꺼져 있을 때 클립을 임시 대기열(`chrome.storage.local`)에 보관하고 최근 클립 기록을 표시하기 위해 사용합니다. |
| `sidePanel` | 브라우저 사이드 패널에서 페이지 본문 추출, AI 요약/액션 아이템 추출 및 편집 후 저장 기능을 제공하기 위해 사용합니다. |
| `http://127.0.0.1/*` (Host Permission) | 사용자의 로컬 PC에서 실행 중인 BullsNote Electron 앱의 로컬 브리지(`127.0.0.1:41905`)와 통신하기 위해 사용합니다. 외부 원격 서버로는 어떠한 데이터도 전송하지 않습니다. |

## Privacy Policy (Local-First)
1. **Zero External Data Collection**: BullsNote Clipper는 어떠한 원격 분석(Analytics), 광고 추적, 외부 클라우드 서버 전송도 수행하지 않습니다.
2. **Local-Only Communication**: 모든 클립 데이터는 사용자 PC 내부의 루프백 주소(`http://127.0.0.1:41905`)로만 전송되며, BullsNote 앱이 종료된 경우에만 `chrome.storage.local`에 임시 저장됩니다.
3. **On-Device AI Processing**: AI 요약 및 액션 아이템 추출 기능은 Chrome 내장 AI(`Summarizer` / `LanguageModel`) 또는 확장프로그램 내부의 로컬 규칙 기반 추출기만 사용하며, 외부 LLM API로 페이지 내용을 전송하지 않습니다.
4. **User-Initiated Only**: 웹 페이지 데이터 접근은 사용자가 팝업, 사이드 패널, 또는 우클릭 컨텍스트 메뉴를 명시적으로 실행한 시점에만 이루어집니다.
