import { describe, expect, it } from 'vitest';
import { formatNotices, packageNameFromModuleId } from '../vite-plugin-third-party-notices';

describe('packageNameFromModuleId', () => {
  it('일반·스코프·중첩 node_modules 경로에서 패키지 이름을 꺼낸다', () => {
    expect(packageNameFromModuleId('/app/node_modules/react/index.js')).toBe('react');
    expect(packageNameFromModuleId('/app/node_modules/@blocknote/core/dist/x.js?v=1')).toBe('@blocknote/core');
    expect(packageNameFromModuleId('/app/node_modules/a/node_modules/b/lib/c.js')).toBe('b');
    expect(packageNameFromModuleId('C:\\app\\node_modules\\@mantine\\core\\x.js')).toBe('@mantine/core');
  });
  it('앱 소스·가상 모듈은 null', () => {
    expect(packageNameFromModuleId('/app/src/main.tsx')).toBeNull();
    expect(packageNameFromModuleId('\0vite/preload-helper')).toBeNull();
  });
});

describe('formatNotices', () => {
  it('이름순으로, 같은 패키지·버전은 한 번만, 라이선스 원문을 함께 쓴다', () => {
    const text = formatNotices([
      { name: 'zeta', version: '1.0.0', license: 'MIT', licenseText: 'Z text' },
      { name: 'alpha', version: '2.0.0', license: 'MPL-2.0', licenseText: null },
      { name: 'zeta', version: '1.0.0', license: 'MIT', licenseText: 'Z text' },
    ]);
    expect(text.indexOf('alpha@2.0.0')).toBeLessThan(text.indexOf('zeta@1.0.0'));
    expect(text.match(/zeta@1\.0\.0/g)).toHaveLength(1);
    expect(text).toContain('License: MPL-2.0');
    expect(text).toContain('Z text');
    expect(text).toContain('https://spdx.org/licenses/MPL-2.0.html');
  });
});
