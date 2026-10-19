import packageJson from '../../package.json';

export const APP_VERSION: string =
  (typeof window !== 'undefined' && (window as unknown as { bullsNote?: { version?: string } }).bullsNote?.version) ||
  packageJson.version ||
  '1.1.1';
