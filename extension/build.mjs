import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const iconsDistDir = path.join(distDir, 'icons');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(iconsDistDir, { recursive: true });

await esbuild.build({
  entryPoints: [
    path.join(__dirname, 'src', 'background.ts'),
    path.join(__dirname, 'src', 'popup.ts'),
    path.join(__dirname, 'src', 'sidepanel.ts'),
  ],
  outdir: distDir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

const pkgPath = path.join(__dirname, 'package.json');
const manifestPath = path.join(__dirname, 'manifest.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (pkg.version && manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[extension] Synced manifest.json version -> ${pkg.version}`);
}

const distManifest = {
  ...manifest,
  version: pkg.version || manifest.version,
};
fs.writeFileSync(path.join(distDir, 'manifest.json'), `${JSON.stringify(distManifest, null, 2)}\n`, 'utf8');
fs.copyFileSync(path.join(__dirname, 'src', 'popup.html'), path.join(distDir, 'popup.html'));
fs.copyFileSync(path.join(__dirname, 'src', 'sidepanel.html'), path.join(distDir, 'sidepanel.html'));

const publicIcon = path.join(__dirname, 'public', 'icons', 'icon128.png');
const fallbackIcon = path.join(__dirname, '..', 'electron', 'assets', 'icon.png');
const iconSrc = fs.existsSync(publicIcon) ? publicIcon : fallbackIcon;
fs.copyFileSync(iconSrc, path.join(iconsDistDir, 'icon128.png'));

console.log('[extension] Built MV3 bundle ->', distDir, `(v${distManifest.version})`);
