export interface VaultApi {
  getPath(): Promise<string>;
  setPath(p: string): Promise<string>;
  pickDir(): Promise<string | null>;
  list(): Promise<{ root: string; files: Array<{ id: string; mtimeMs: number }> }>;
  read(id: string): Promise<string | null>;
  /** 저장 후 파일 mtime(ms) 반환 (구버전 메인 프로세스는 true) */
  write(id: string, text: string): Promise<number | boolean>;
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

export interface GoogleAuthResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: {
    email: string;
    name: string;
    picture?: string;
  };
}

export interface GoogleRefreshTokenResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  expiresAt?: number;
}

export interface GoogleAuthApi {
  startLogin(opts?: { clientId?: string; clientSecret?: string }): Promise<GoogleAuthResult>;
  refreshToken(opts: { clientId?: string; clientSecret?: string; refreshToken: string }): Promise<GoogleRefreshTokenResult>;
}

export interface McpClientStatus {
  id: string;
  name: string;
  configPath: string;
  /** 해당 AI 클라이언트의 설정 폴더가 존재하는지 (설치 여부 추정) */
  installed: boolean;
  connected: boolean;
  /** 등록된 실행 경로가 현재 앱 위치와 일치하는지 */
  upToDate: boolean;
  error?: string;
}

export interface McpStatus {
  entry: { command: string; args: string[]; env: Record<string, string> };
  clients: McpClientStatus[];
}

export interface McpApi {
  status(): Promise<McpStatus>;
  connect(id: string): Promise<McpStatus>;
  disconnect(id: string): Promise<McpStatus>;
}

declare global {
  interface Window {
    bullsNote?: {
      platform: string;
      version: string;
      vault?: VaultApi;
      notification?: NotificationApi;
      print?: PrintApi;
      googleAuth?: GoogleAuthApi;
      mcp?: McpApi;
    };
  }
}

export {};
