// 빌드 결과물에 실제로 들어간 npm 패키지의 라이선스 고지를 dist/THIRD_PARTY_NOTICES.txt 로 만든다.
// 웹(PWA)과 Electron 설치 파일 모두 dist/ 를 그대로 싣기 때문에 한 번 만들면 양쪽에 함께 들어간다.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export interface NoticeEntry {
  name: string;
  version: string;
  license: string;
  licenseText: string | null;
}

/** 모듈 경로에서 마지막 node_modules 아래 패키지 이름 (앱 소스·가상 모듈은 null) */
export function packageNameFromModuleId(id: string): string | null {
  if (id.startsWith('\0')) return null;
  const parts = id.split('?')[0].split(/[\\/]/);
  const idx = parts.lastIndexOf('node_modules');
  if (idx === -1 || idx + 1 >= parts.length) return null;
  const first = parts[idx + 1];
  if (first.startsWith('@')) return idx + 2 < parts.length ? `${first}/${parts[idx + 2]}` : null;
  return first;
}

export function formatNotices(entries: NoticeEntry[]): string {
  const unique = new Map<string, NoticeEntry>();
  for (const e of entries) unique.set(`${e.name}@${e.version}`, e);
  const sorted = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  const header = [
    'BullsNote — Third-Party Notices',
    '',
    'BullsNote includes the following open source software.',
    'Each package is licensed under the terms shown below.',
    '',
  ].join('\n');
  const body = sorted.map((e) =>
    [
      '='.repeat(72),
      `${e.name}@${e.version}`,
      `License: ${e.license}`,
      '-'.repeat(72),
      e.licenseText?.trim() || `(The package ships no license file. Full text: https://spdx.org/licenses/${e.license}.html)`,
      '',
    ].join('\n')
  );
  return `${header}\n${body.join('\n')}`;
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

/** 모듈 경로에서 패키지 폴더 (…/node_modules/<name>) */
function packageDirOf(id: string, name: string): string {
  // Vite 모듈 id 는 Windows 에서도 / 를 쓰지만, 혹시 모를 \ 도 / 로 맞춘다 (fs 는 둘 다 받는다)
  const clean = id.split('?')[0].replace(/\\/g, '/');
  const marker = `node_modules/${name}`;
  const at = clean.lastIndexOf(marker);
  return clean.slice(0, at + marker.length);
}

function readEntry(dir: string): NoticeEntry | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
      license?: string | { type?: string };
    };
    if (!pkg.name || !pkg.version) return null;
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN';
    const file = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f));
    return {
      name: pkg.name,
      version: pkg.version,
      license,
      licenseText: file ? fs.readFileSync(path.join(dir, file), 'utf8') : null,
    };
  } catch {
    return null;
  }
}

export function thirdPartyNotices(fileName = 'THIRD_PARTY_NOTICES.txt'): Plugin {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
      const dirs = new Map<string, string>();
      for (const id of this.getModuleIds()) {
        const name = packageNameFromModuleId(id);
        if (!name) continue;
        const dir = packageDirOf(id, name);
        if (!dirs.has(dir)) dirs.set(dir, name);
      }
      const entries = [...dirs.keys()].map(readEntry).filter((e): e is NoticeEntry => e !== null);
      this.emitFile({ type: 'asset', fileName, source: formatNotices(entries) });
    },
  };
}
