# BullsNote Supabase Auth & Cloud Sync 설정 가이드

BullsNote는 **Google Drive 직접 동기화** 외에도, **Supabase**를 통해 이메일 회원가입/로그인, 매직링크(비밀번호 없는 로그인), Google OAuth 로그인 및 실시간 클라우드 동기화(노트·프로젝트·할일 상태 설정)를 지원합니다.

---

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com/)에 로그인 후 **New Project**를 클릭합니다.
2. 프로젝트 이름(예: `bullsnote`), 데이터베이스 비밀번호, 리전(예: `Northeast Asia (Seoul)`)을 선택하고 생성합니다.
3. 생성이 완료되면 **Project Settings > API** (또는 **Data API**)에서 다음 두 값을 확인합니다:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (`eyJ...`)

---

## 2. 데이터베이스 스키마 & RLS 적용

1. Supabase 대시보드 좌측 메뉴에서 **SQL Editor**로 이동합니다.
2. **New query**를 열고 저장소의 [`supabase/schema.sql`](../supabase/schema.sql) 내용을 그대로 붙여넣은 뒤 **Run**을 클릭합니다.
3. 다음 3개 테이블과 RLS 정책, 인덱스가 생성되었는지 확인합니다:
   - `bullsnote_projects`
   - `bullsnote_notes`
   - `bullsnote_settings`

---

## 3. 인증(Authentication) 설정

### 3-1. Email / Magic Link 활성화
1. **Authentication > Providers > Email**에서 **Enable Email provider**가 켜져 있는지 확인합니다.
2. 비밀번호 없이 이메일 링크로 로그인하는 **Magic Link**도 Email Provider에 기본 포함됩니다.
3. (선택) 개발/테스트 중 이메일 인증 없이 바로 로그인하려면 **Confirm email** 옵션을 끄고 저장합니다.

### 3-2. Google OAuth 활성화 (선택)
1. [Google Cloud Console](https://console.cloud.google.com/)에서 웹 애플리케이션용 OAuth 클라이언트 ID를 생성합니다.
2. 승인된 리디렉션 URI에 Supabase의 Callback URL(`https://<PROJECT_REF>.supabase.co/auth/v1/callback`)을 등록합니다.
3. Supabase **Authentication > Providers > Google**을 활성화하고 Google Client ID와 Client Secret을 입력합니다.

### 3-3. Redirect URLs 등록 (중요!)
**Authentication > URL Configuration**에서 아래 주소를 설정합니다:
- **Site URL**: `https://bullseye73.github.io/bullsNote/`
- **Redirect URLs**에 모두 추가:
  - `https://bullseye73.github.io/bullsNote/`
  - `https://bullseye73.github.io/bullsNote/**`
  - `http://localhost:5190/`
  - `http://localhost:5190/**`
  - `http://127.0.0.1:*` (Electron 데스크톱 Google OAuth 루프백용)
  - `http://127.0.0.1/**` (Electron 데스크톱 Google OAuth 루프백용)

---

## 4. 환경 변수 및 GitHub Actions Secrets 설정

### 4-1. 로컬 개발 (`.env`)
프로젝트 루트에 `.env` 파일을 생성(또는 수정)하고 아래 값을 입력합니다:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4-2. GitHub Pages 배포 (GitHub Actions Secrets)
GitHub 저장소 **Settings > Secrets and variables > Actions > New repository secret**에 다음 두 시크릿을 등록합니다:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`.github/workflows/deploy-pwa.yml`이 빌드 시 자동으로 이 값을 번들에 주입합니다.

### 4-3. 인앱 직접 설정 (빌드 환경 변수 없이 사용 시)
환경 변수가 설정되지 않은 빌드에서도 로그인 화면 또는 상단 **계정 / 클라우드** 모달의 **"Supabase 연결 설정"**을 펼쳐 URL과 Anon Key를 직접 입력하면 브라우저 `localStorage`에 저장되어 즉시 동작합니다.
