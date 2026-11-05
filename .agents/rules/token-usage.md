---
trigger: always_on
description: 대화 진행 시마다 응답 하단에 AI 토큰 사용량과 잔여 컨텍스트 용량을 자동으로 표시합니다.
---

## Automatic AI Token Usage & Remaining Context Display (`token-usage`)

Whenever you respond to the user during a conversation:

1. Run `node /Users/chang-hunjeong/.gemini/config/skills/token-usage/scripts/token-stats.mjs <conversation-id>` in Standard Sandbox Mode (`BypassSandbox: false`, substituting your current `Conversation ID` from `<user_information>`) before finishing your response.
2. At the very end of your response, always include the **📊 AI 토큰 현황** compact footer line showing:
   - **현재 컨텍스트 사용량 및 잔여량**: `현재 사용 토큰 / 250,000` (프로그레스 바 + 사용률 `%` + 자동 압축 전 잔여 토큰 + 1M 최대 윈도우 기준 잔여 토큰)
   - **이번 턴 사용량**: 신규 입력 · 캐시 읽기 · 출력 토큰
   - **누적 캐시 적중률**: 세션 전체 캐시 히트율 (`%`)
