export interface VaultApi {
  getPath(): Promise<string>;
  setPath(p: string): Promise<string>;
  pickDir(): Promise<string | null>;
  list(): Promise<{ root: string; files: Array<{ id: string; mtimeMs: number }> }>;
  read(id: string): Promise<string | null>;
  write(id: string, text: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  writeAsset(name: string, base64: string): Promise<string>;
  readAsset(name: string): Promise<string | null>;
  readSidecar(): Promise<Record<string, unknown>>;
  writeSidecar(data: Record<string, unknown>): Promise<boolean>;
}

declare global {
  interface Window {
    bullsNote?: {
      platform: string;
      version: string;
      vault?: VaultApi;
    };
  }
}

export {};
