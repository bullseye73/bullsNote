---
trigger: always_on
description: Automatically generate a copy-ready Conventional Commit message in Korean whenever code files are modified or when requested.
---

## Automatic Git Commit Message Generation (`git-commit-message`)

Whenever you finish modifying, creating, or deleting project files in this repository during a turn (or when the user asks for a commit message):

1. Follow the `git-commit-message` skill (`/Users/chang-hunjeong/.gemini/config/skills/git-commit-message/SKILL.md`).
2. At the end of your response, always include a **추천 Git Commit 메시지** section with:
   - **한 줄 메시지 (요약)**: `<type>: <한글 핵심 변경 요약>` (e.g. `feat:`, `fix:`, `refactor:`, `style:`, `perf:`, `docs:`, `chore:`)
   - **상세 메시지 (제목 + 본문)**: `<type>: <한글 핵심 변경 요약>` followed by 2–4 concise `- ` bullet points describing the key technical changes.

