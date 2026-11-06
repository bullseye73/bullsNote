import packageJson from '../../package.json';

declare const __APP_VERSION__: string | undefined;

const bridgeVersion =
  typeof window !== 'undefined'
    ? (window as unknown as { bullsNote?: { version?: string } }).bullsNote?.version
    : undefined;

export const APP_VERSION: string =
  bridgeVersion ||
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '') ||
  packageJson.version;
