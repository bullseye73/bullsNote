// Git 태그(vX.Y.Z)와 package.json의 version을 자동으로 동기화하는 스크립트
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');

function parseSemver(v) {
  const clean = String(v || '').trim().replace(/^v/i, '');
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return {
    raw: `${m[1]}.${m[2]}.${m[3]}`,
    parts: [Number(m[1]), Number(m[2]), Number(m[3])],
  };
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  }
  return 0;
}

function getLatestGitTagVersion() {
  // 1. GitHub Actions 태그 환경변수 우선 확인
  const envRef = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || '';
  if (envRef.startsWith('refs/tags/v')) {
    const parsed = parseSemver(envRef.replace('refs/tags/v', ''));
    if (parsed) return parsed;
  } else if (/^v\d+\.\d+\.\d+/.test(envRef)) {
    const parsed = parseSemver(envRef);
    if (parsed) return parsed;
  }

  // 2. 로컬/CI Git 저장소에서 가장 높은 버전 태그 조회
  try {
    const out = execSync('git tag --list "v[0-9]*.[0-9]*.[0-9]*" --sort=-v:refname', {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    const firstTag = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (firstTag) {
      return parseSemver(firstTag);
    }
  } catch {
    // git 미설치 또는 태그 없음 무시
  }
  return null;
}

try {
  const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const currentVer = parseSemver(pkg.version);
  const tagVer = getLatestGitTagVersion();

  if (tagVer && (!currentVer || compareSemver(tagVer, currentVer) > 0)) {
    pkg.version = tagVer.raw;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`[sync-version] package.json version updated: ${currentVer?.raw || 'none'} -> ${tagVer.raw}`);
  }
} catch (err) {
  console.warn('[sync-version] 버전 동기화 건너뜀:', err?.message || err);
}

