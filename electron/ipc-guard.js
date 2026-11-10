// 신뢰된 발신자(앱 자체 문서)만 호출할 수 있는 ipcMain.handle 래퍼
const { ipcMain } = require('electron');
const { isTrustedSender } = require('./app-origin');

function secureHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      const from = event && event.senderFrame ? event.senderFrame.url : 'unknown';
      console.warn(`[BullsNote] 신뢰되지 않은 IPC 호출 차단: ${channel} (from ${from})`);
      throw new Error('허용되지 않은 호출입니다.');
    }
    return handler(event, ...args);
  });
}

module.exports = { secureHandle };
