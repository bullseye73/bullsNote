// electron/google-auth-ipc.js: Google OAuth 2.0 Loopback (RFC 8252 PKCE) 핸들러
const { ipcMain, shell, BrowserWindow } = require('electron');
const http = require('http');
const crypto = require('crypto');

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function registerGoogleAuthIpc(app) {
  ipcMain.handle('googleAuth:startLogin', async (_event, options = {}) => {
    const clientId = (options.clientId || '').trim();
    const clientSecret = (options.clientSecret || '').trim();

    if (!clientId) {
      return {
        success: false,
        error: 'Google OAuth Client ID가 입력되지 않았습니다. Google Cloud Console에서 데스크톱 OAuth 클라이언트 ID를 발급받아 입력해주세요.',
      };
    }

    return new Promise((resolve) => {
      let resolved = false;
      const codeVerifier = base64Url(crypto.randomBytes(32));
      const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
      const state = crypto.randomBytes(16).toString('hex');

      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url, `http://${req.headers.host}`);

          // 브라우저의 자동 /favicon.ico 요청은 무시하여 상태 오류가 발생하지 않도록 처리
          if (reqUrl.pathname === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
          }

          const code = reqUrl.searchParams.get('code');
          const incomingState = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
              <h2 style="color:#e11d48">로그인 취소 또는 오류</h2>
              <p>오류: ${error}</p>
              <p>BullsNote로 돌아가 다시 시도해주세요.</p>
            </body></html>`);
            safeClose();
            if (!resolved) {
              resolved = true;
              resolve({ success: false, error: `인증 취소 또는 오류: ${error}` });
            }
            return;
          }

          if (incomingState !== state || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('잘못된 요청입니다.');
            return;
          }

          // 정상 콜백 페이지 렌더링 (시스템 브라우저 안내 및 창 자동 닫기 시도)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BullsNote - Google 인증 완료</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
    }
    .card {
      text-align: center;
      padding: 40px 32px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      max-width: 420px;
    }
    h2 { color: #38bdf8; margin: 0 0 12px 0; font-size: 22px; }
    p { margin: 8px 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
    .badge {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 18px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>✓ Google 계정 연동 완료</h2>
    <p>BullsNote와 Google Drive가 성공적으로 연결되었습니다.</p>
    <p>이 브라우저 탭을 닫고 <strong>BullsNote 앱 창</strong>으로 돌아가세요.</p>
    <span class="badge">인증 완료 · 앱으로 자동 전환됨</span>
  </div>
  <script>
    setTimeout(() => { window.close(); }, 1200);
  </script>
</body>
</html>`);

          // 1.5초 후 루프백 서버 종료 및 BullsNote 메인 창 포커스 복귀
          setTimeout(() => {
            safeClose();
          }, 1500);
          focusAppWindow();

          // Authorization Code -> Access / Refresh Token 교환
          try {
            const redirectUri = `http://127.0.0.1:${port}`;
            const tokenParams = new URLSearchParams({
              code,
              client_id: clientId,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
            });
            if (clientSecret) {
              tokenParams.append('client_secret', clientSecret);
            }

            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: tokenParams.toString(),
            });

            if (!tokenRes.ok) {
              const errBody = await tokenRes.text();
              let friendlyError = `토큰 발급 실패 (${tokenRes.status}): ${errBody}`;
              try {
                const parsedErr = JSON.parse(errBody);
                if (parsedErr.error === 'invalid_client') {
                  if (parsedErr.error_description && parsedErr.error_description.includes('client_secret is missing')) {
                    friendlyError =
                      'Client Secret이 필요합니다. Google Cloud 콘솔에서 발급받은 [Client Secret(클라이언트 보안 비밀번호)]을 함께 입력하거나, [데스크톱 앱] 유형의 OAuth 클라이언트 ID로 새로 발급받아 주세요.';
                  } else {
                    friendlyError =
                      '유효하지 않은 Client ID 또는 Client Secret입니다(401 invalid_client). 입력한 값에 오타나 공백이 없는지, 또는 Google Cloud 콘솔에서 [데스크톱 앱] 유형으로 생성되었는지 확인해주세요.';
                  }
                } else if (parsedErr.error_description) {
                  friendlyError = `토큰 발급 실패 (${parsedErr.error}): ${parsedErr.error_description}`;
                }
              } catch {
                /* ignore JSON parse error */
              }
              throw new Error(friendlyError);
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;
            const refreshToken = tokenData.refresh_token;
            const expiresIn = tokenData.expires_in || 3600;

            // 유저 프로필 조회
            let userInfo = { email: '', name: 'Google 사용자', picture: '' };
            try {
              const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (userRes.ok) {
                const u = await userRes.json();
                userInfo = {
                  email: u.email || '',
                  name: u.name || u.email || 'Google 사용자',
                  picture: u.picture || '',
                };
              }
            } catch {
              /* ignore profile fetch failure */
            }

            if (!resolved) {
              resolved = true;
              resolve({
                success: true,
                accessToken,
                refreshToken,
                expiresAt: Date.now() + expiresIn * 1000,
                user: userInfo,
              });
            }
          } catch (e) {
            if (!resolved) {
              resolved = true;
              resolve({
                success: false,
                error: `토큰 교환 실패: ${e instanceof Error ? e.message : String(e)}`,
              });
            }
          }
        } catch (err) {
          safeClose();
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: String(err) });
          }
        }
      });

      let port = 0;
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}`;
        const scopes = [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
        ].join(' ');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
          clientId,
        )}&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&response_type=code&scope=${encodeURIComponent(
          scopes,
        )}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&access_type=offline&prompt=consent`;

        // Google OAuth 보안 정책(Embedded WebView / BrowserWindow 차단: "브라우저 또는 앱이 안전하지 않을 수 있습니다") 준수를 위해
        // RFC 8252 표준에 따라 시스템 기본 브라우저(Chrome/Safari 등)로 인증 URL을 오픈합니다.
        shell.openExternal(authUrl).catch((err) => {
          safeClose();
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: `시스템 브라우저를 열지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        });
      });

      // 3분 타임아웃
      const timer = setTimeout(() => {
        safeClose();
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: '인증 시간 초과 (3분이 경과했습니다)' });
        }
      }, 180_000);

      function focusAppWindow() {
        try {
          if (app && typeof app.focus === 'function') {
            app.focus({ steal: true });
          }
          const wins = BrowserWindow.getAllWindows();
          if (wins.length > 0) {
            const mainWin = wins[0];
            if (mainWin && !mainWin.isDestroyed()) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();
            }
          }
        } catch {
          /* ignore */
        }
      }

      function safeClose() {
        clearTimeout(timer);
        try {
          server.close();
        } catch {
          /* ignore */
        }
      }
    });
  });

  ipcMain.handle('googleAuth:refreshToken', async (_event, options = {}) => {
    const clientId = (options.clientId || '').trim();
    const clientSecret = (options.clientSecret || '').trim();
    const refreshToken = (options.refreshToken || '').trim();

    if (!refreshToken) {
      return { success: false, error: '리프레시 토큰이 없습니다.' };
    }
    if (!clientId) {
      return { success: false, error: 'Google Client ID가 없습니다.' };
    }

    try {
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      if (clientSecret) {
        tokenParams.append('client_secret', clientSecret);
      }

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `토큰 갱신 실패 (${res.status}): ${errText}` };
      }

      const data = await res.json();
      return {
        success: true,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      };
    } catch (e) {
      return {
        success: false,
        error: `토큰 갱신 중 네트워크 오류: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });
}

module.exports = { registerGoogleAuthIpc };
