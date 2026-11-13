import { describe, expect, it } from 'vitest';
import { resolveOAuthClient } from '../oauthClient';

describe('resolveOAuthClient', () => {
  const env = { VITE_GOOGLE_CLIENT_ID: 'builtin-id', VITE_GOOGLE_CLIENT_SECRET: 'builtin-secret' };

  it('사용자가 입력한 클라이언트를 먼저 쓴다', () => {
    expect(resolveOAuthClient({ customClientId: ' my-id ', customClientSecret: 's' }, env)).toEqual({
      clientId: 'my-id',
      clientSecret: 's',
      source: 'custom',
    });
  });

  it('입력이 없으면 빌드에 포함된 클라이언트', () => {
    expect(resolveOAuthClient({ customClientId: '' }, env)).toEqual({
      clientId: 'builtin-id',
      clientSecret: 'builtin-secret',
      source: 'builtin',
    });
  });

  it('둘 다 없으면 none', () => {
    expect(resolveOAuthClient({}, {})).toEqual({ clientId: '', clientSecret: '', source: 'none' });
  });
});
