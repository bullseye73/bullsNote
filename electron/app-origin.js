// 앱 자체 페이지(신뢰 출처) 판별 유틸: 내비게이션 제한과 IPC 발신자 검증에서 공용으로 사용
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const DEV_ORIGIN = 'http://localhost:5190';
const PROD_INDEX_PATH = path.join(__dirname, '../dist/index.html');

function isDevMode() {
  return !app.isPackaged;
}

/** 프로덕션 index.html 의 file:// pathname (해시·쿼리 제외 비교용) */
function prodIndexPathname() {
  return pathToFileURL(PROD_INDEX_PATH).pathname;
}

/**
 * 주어진 URL이 BullsNote 앱 자체 문서인지 확인
 * - 개발: http://localhost:5190 오리진
 * - 프로덕션: dist/index.html 파일 (다른 file:// 경로는 모두 불허)
 */
function isAppUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (isDevMode() && u.origin === DEV_ORIGIN) return true;
  if (u.protocol === 'file:') {
    return decodeURIComponent(u.pathname) === decodeURIComponent(prodIndexPathname());
  }
  return false;
}

/** ipcMain 이벤트가 앱 메인 문서의 최상위 프레임에서 왔는지 검증 */
function isTrustedSender(event) {
  const frame = event && event.senderFrame;
  if (!frame) return false;
  if (frame.parent) return false; // iframe 등 하위 프레임 차단
  return isAppUrl(frame.url);
}

module.exports = { DEV_ORIGIN, PROD_INDEX_PATH, isAppUrl, isTrustedSender, isDevMode };
