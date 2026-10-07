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

export interface NotificationApi {
  show(data: { title: string; body?: string; noteId: string }): Promise<boolean>;
  onOpenNote(callback: (noteId: string) => void): () => void;
}

export interface PrintApi {
  exportPdf(title: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
}

declare global {
  interface Window {
    bullsNote?: {
      platform: string;
      version: string;
      vault?: VaultApi;
      notification?: NotificationApi;
      print?: PrintApi;
    };
  }
}

export {};
