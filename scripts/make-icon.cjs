// BullsNote 아이콘 생성 래퍼: node scripts/make-icon.cjs
// 확정된 Option C (레드 메모패드 + 펜슬 + B 타일)를 기본 적용합니다.
const { spawnSync } = require('child_process');
const path = require('path');

const psScript = path.join(__dirname, 'apply-selected-option.ps1');
const option = process.argv[2] || 'C';

const result = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psScript, '-Option', option], {
  stdio: 'inherit',
});

if (result.error) {
  console.error('아이콘 생성 실패:', result.error);
  process.exit(1);
}
process.exit(result.status || 0);
