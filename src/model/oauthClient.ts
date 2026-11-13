// MODEL: Google OAuth 클라이언트 결정 규칙
// - 사용자가 직접 입력한 클라이언트(고급 설정)가 있으면 우선
// - 없으면 빌드 시 포함된 앱 기본 클라이언트(VITE_GOOGLE_CLIENT_ID/SECRET)
// - 둘 다 없으면 none → 화면에서 고급 입력으로 안내

export interface ResolvedOAuthClient {
  clientId: string;
  clientSecret: string;
  source: 'custom' | 'builtin' | 'none';
}

export function resolveOAuthClient(
  cfg: { customClientId?: string; customClientSecret?: string },
  env: { VITE_GOOGLE_CLIENT_ID?: string; VITE_GOOGLE_CLIENT_SECRET?: string }
): ResolvedOAuthClient {
  const customId = (cfg.customClientId ?? '').trim();
  if (customId) {
    return { clientId: customId, clientSecret: (cfg.customClientSecret ?? '').trim(), source: 'custom' };
  }
  const builtinId = (env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
  if (builtinId) {
    return { clientId: builtinId, clientSecret: (env.VITE_GOOGLE_CLIENT_SECRET ?? '').trim(), source: 'builtin' };
  }
  return { clientId: '', clientSecret: '', source: 'none' };
}

/** 앱에 포함된 기본 OAuth 클라이언트 환경 변수 */
export const BUILTIN_OAUTH_ENV = {
  VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  VITE_GOOGLE_CLIENT_SECRET: import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined,
};
