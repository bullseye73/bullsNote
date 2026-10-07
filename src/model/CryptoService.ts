// MODEL: Web Crypto API 기반 종단간 암호화(E2EE) 서비스 (AES-GCM 256 + PBKDF2)
import { Note } from './Note';

export const VERIFIER_STORAGE_KEY = 'bullsnote.security.verifier.v1';
export const VERIFY_PAYLOAD = 'BULLSNOTE_KEY_VALIDATION_TOKEN';
export const ENC_PREFIX = 'ENC:v1:';

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = toUint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = toUint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

class CryptoServiceSingleton {
  /** 현재 메모리에 캐시된 마스터 비밀번호 및 salt별 CryptoKey 캐시 (메모리 전용) */
  private cachedPassword: string | null = null;
  private keyCache = new Map<string, CryptoKey>();
  private masterSaltHex: string | null = null;

  /** 암호문 문자열 안전 추출 (블록 JSON 안에 파라그래프로 감싸진 경우에도 안전하게 언래핑) */
  extractCiphertext(text: string): string {
    if (!text || typeof text !== 'string') return '';
    if (text.startsWith(ENC_PREFIX)) return text;
    if (text.includes(ENC_PREFIX)) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          const first = parsed[0];
          const c = first?.content;
          if (typeof c === 'string' && c.startsWith(ENC_PREFIX)) return c;
          if (Array.isArray(c) && c.length >= 1 && typeof c[0]?.text === 'string' && c[0].text.startsWith(ENC_PREFIX)) {
            return c[0].text;
          }
        }
      } catch {}
    }
    return text;
  }

  /** 암호화 데이터 여부 확인 */
  isEncrypted(text: string): boolean {
    if (typeof text !== 'string') return false;
    const clean = this.extractCiphertext(text);
    return clean.startsWith(ENC_PREFIX);
  }

  /** 이전 버전 버그로 인해 임시 안내 문구가 본문으로 영구 저장된 손상 상태인지 감지 */
  isCorruptedPlaceholder(text: string): boolean {
    if (typeof text !== 'string') return false;
    return (
      text.includes('상단 자물쇠 버튼을 눌러 마스터 비밀번호로 잠금을 해제하세요') ||
      text.includes('복호화에 실패했습니다. 올바른 마스터 비밀번호로')
    );
  }

  /** 암호문으로부터 salt 추출 */
  extractSaltHex(ciphertext: string): string | null {
    const raw = this.extractCiphertext(ciphertext);
    if (!raw.startsWith(ENC_PREFIX)) return null;
    try {
      const parts = raw.slice(ENC_PREFIX.length).split(':');
      return parts.length >= 1 && parts[0].length > 0 ? parts[0] : null;
    } catch {
      return null;
    }
  }

  /** 마스터 비밀번호가 설정되어 있는지 여부 */
  isMasterPasswordSet(notes?: Note[]): boolean {
    try {
      if (localStorage.getItem(VERIFIER_STORAGE_KEY)) return true;
    } catch {}
    if (notes && notes.some((n) => this.isEncrypted(n.content))) {
      return true;
    }
    return false;
  }

  /** 현재 세션이 잠금 해제(복호화 키 메모리 보유) 상태인지 여부 */
  isUnlocked(): boolean {
    return this.cachedPassword !== null;
  }

  /** 비밀번호와 salt로부터 AES-GCM 256비트 CryptoKey 파생 */
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** saltHex에 대응하는 CryptoKey 획득 (캐시 우선, 없으면 파생) */
  private async getKeyForSalt(saltHex: string): Promise<CryptoKey | null> {
    if (!this.cachedPassword) return null;
    const cached = this.keyCache.get(saltHex);
    if (cached) return cached;

    try {
      const saltBytes = new Uint8Array(hexToArrayBuffer(saltHex));
      const key = await this.deriveKey(this.cachedPassword, saltBytes);
      this.keyCache.set(saltHex, key);
      return key;
    } catch (e) {
      console.warn('키 파생 오류:', e);
      return null;
    }
  }

  /** 마스터 비밀번호 최초 설정 (기존 salt가 있을 경우 일관성을 위해 재사용 가능) */
  async setupMasterPassword(password: string, existingSaltHex?: string | null): Promise<boolean> {
    if (!password || password.length < 4) {
      throw new Error('비밀번호는 최소 4자리 이상이어야 합니다.');
    }

    const salt =
      existingSaltHex && existingSaltHex.length >= 16
        ? new Uint8Array(hexToArrayBuffer(existingSaltHex))
        : window.crypto.getRandomValues(new Uint8Array(16));
    const saltHex = arrayBufferToHex(salt);

    const key = await this.deriveKey(password, salt);

    // 검증용 토큰 암호화
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encryptedToken = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      enc.encode(VERIFY_PAYLOAD)
    );

    const verifierString = `${ENC_PREFIX}${saltHex}:${arrayBufferToHex(iv)}:${arrayBufferToBase64(encryptedToken)}`;
    try {
      localStorage.setItem(VERIFIER_STORAGE_KEY, verifierString);
    } catch {}

    this.cachedPassword = password;
    this.masterSaltHex = saltHex;
    this.keyCache.set(saltHex, key);
    return true;
  }

  /** 마스터 비밀번호로 잠금 해제 (로컬 verifier 또는 기존 암호화된 노트 샘플들을 활용하여 검증) */
  async unlock(password: string, candidateCiphertexts: string[] = []): Promise<boolean> {
    if (!password) return false;

    // 1. 로컬에 저장된 verifier가 있으면 우선 검증 시도
    let verifier = '';
    try {
      verifier = localStorage.getItem(VERIFIER_STORAGE_KEY) || '';
    } catch {}

    if (verifier && this.isEncrypted(verifier)) {
      try {
        const cleanVerifier = this.extractCiphertext(verifier);
        const parts = cleanVerifier.slice(ENC_PREFIX.length).split(':');
        if (parts.length === 3) {
          const saltHex = parts[0];
          const salt = new Uint8Array(hexToArrayBuffer(saltHex));
          const iv = new Uint8Array(hexToArrayBuffer(parts[1]));
          const ciphertext = base64ToArrayBuffer(parts[2]);

          const key = await this.deriveKey(password, salt);
          const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            key,
            ciphertext
          );

          const decryptedText = new TextDecoder().decode(decryptedBuffer);
          if (decryptedText === VERIFY_PAYLOAD) {
            this.cachedPassword = password;
            this.masterSaltHex = saltHex;
            this.keyCache.set(saltHex, key);
            return true;
          }
        }
      } catch (err) {
        console.warn('로컬 verifier 검증 실패, 암호문 직접 검증 시도:', err);
      }
    }

    // 2. verifier가 없거나 실패한 경우 (예: 새 기기에서 Supabase로 가져온 암호화 노트가 있는 경우)
    // 실제 암호화된 노트의 ciphertext를 직접 복호화 시도하여 비밀번호를 검증
    for (const c of candidateCiphertexts) {
      if (!this.isEncrypted(c)) continue;
      try {
        const cleanCiphertext = this.extractCiphertext(c);
        const parts = cleanCiphertext.slice(ENC_PREFIX.length).split(':');
        if (parts.length !== 3) continue;
        const saltHex = parts[0];
        const salt = new Uint8Array(hexToArrayBuffer(saltHex));
        const iv = new Uint8Array(hexToArrayBuffer(parts[1]));
        const ciphertext = base64ToArrayBuffer(parts[2]);

        const key = await this.deriveKey(password, salt);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as unknown as BufferSource },
          key,
          ciphertext
        );

        const decryptedText = new TextDecoder().decode(decryptedBuffer);
        // 복호화가 정상적으로 완료되면 (AES-GCM 인증 태그 일치) 비밀번호 검증 성공!
        if (decryptedText && decryptedText.length > 0) {
          this.cachedPassword = password;
          this.masterSaltHex = saltHex;
          this.keyCache.set(saltHex, key);

          // 이 기기에도 verifier를 새로 생성하여 로컬스토리지에 저장 (다음번 잠금 해제 가속)
          try {
            const vIv = window.crypto.getRandomValues(new Uint8Array(12));
            const enc = new TextEncoder();
            const encryptedToken = await window.crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: vIv as unknown as BufferSource },
              key,
              enc.encode(VERIFY_PAYLOAD)
            );
            const newVerifier = `${ENC_PREFIX}${saltHex}:${arrayBufferToHex(vIv)}:${arrayBufferToBase64(encryptedToken)}`;
            localStorage.setItem(VERIFIER_STORAGE_KEY, newVerifier);
          } catch {}

          return true;
        }
      } catch {
        // 이 ciphertext 복호화 실패 -> 계속 시도
      }
    }

    return false;
  }

  /** 앱 수동 잠금 (메모리에서 비밀번호 및 파생 키 폐기) */
  lock(): void {
    this.cachedPassword = null;
    this.keyCache.clear();
    this.masterSaltHex = null;
  }

  /** 보안 해제 (마스터 비밀번호 제거) */
  removeMasterPassword(): void {
    try {
      localStorage.removeItem(VERIFIER_STORAGE_KEY);
    } catch {}
    this.lock();
  }

  /** 평문 텍스트 -> AES-GCM 256 암호화 (언락되지 않았거나 이미 암호문이면 원본 반환) */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    // 이미 암호화된 경우 중복 암호화 방지
    if (this.isEncrypted(plaintext)) return plaintext;

    // 잠금 상태이거나 비밀번호가 없으면 원본 반환
    if (!this.isUnlocked() || !this.cachedPassword) return plaintext;

    try {
      const saltHex = this.masterSaltHex || arrayBufferToHex(window.crypto.getRandomValues(new Uint8Array(16)));
      this.masterSaltHex = saltHex;
      const key = await this.getKeyForSalt(saltHex);
      if (!key) return plaintext;

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        enc.encode(plaintext)
      );

      return `${ENC_PREFIX}${saltHex}:${arrayBufferToHex(iv)}:${arrayBufferToBase64(ciphertext)}`;
    } catch (err) {
      console.error('암호화 실패:', err);
      return plaintext;
    }
  }

  /** 암호문 -> 평문 텍스트 복호화
   * ★중요: 잠겨있거나 복호화 실패 시 절대 안내 문구로 덮어쓰지 않고 원본 암호문을 그대로 반환하여 데이터 보존! */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext) return '';
    const raw = this.extractCiphertext(ciphertext);
    // 암호화되지 않은 일반 텍스트는 그대로 반환
    if (!this.isEncrypted(raw)) return ciphertext;

    // 잠금 상태이거나 키가 없으면 원본 암호문을 그대로 반환 (절대 플레이스홀더 문자열로 원본 파괴 금지!)
    if (!this.isUnlocked() || !this.cachedPassword) {
      return raw;
    }

    try {
      const parts = raw.slice(ENC_PREFIX.length).split(':');
      if (parts.length !== 3) return raw;

      const saltHex = parts[0];
      const iv = new Uint8Array(hexToArrayBuffer(parts[1]));
      const data = base64ToArrayBuffer(parts[2]);

      const key = await this.getKeyForSalt(saltHex);
      if (!key) return raw;

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.warn('복호화 실패 (비밀번호 불일치 등):', err);
      return raw;
    }
  }

  /** 복수 노트 일괄 암호화 (history 스냅샷 본문도 함께 암호화) */
  async encryptNotes(notes: Note[]): Promise<Note[]> {
    if (!this.isUnlocked()) return notes;
    const result: Note[] = [];
    for (const n of notes) {
      let content = n.content;
      if (!this.isEncrypted(content)) {
        content = await this.encrypt(content);
      }
      let history = n.history;
      if (Array.isArray(history) && history.length > 0) {
        history = await Promise.all(
          history.map(async (h) => {
            if (h.content && !this.isEncrypted(h.content)) {
              return { ...h, content: await this.encrypt(h.content) };
            }
            return h;
          })
        );
      }
      result.push({ ...n, content, history });
    }
    return result;
  }

  /** 복수 노트 일괄 복호화 (history 스냅샷 본문도 함께 복호화 및 손상된 플레이스홀더 자동 치유) */
  async decryptNotes(notes: Note[]): Promise<Note[]> {
    if (!this.isUnlocked()) return notes;
    const result: Note[] = [];
    for (const n of notes) {
      let content = n.content;
      if (this.isEncrypted(content)) {
        content = await this.decrypt(content);
      } else if (this.isCorruptedPlaceholder(content) && Array.isArray(n.history)) {
        // 이전 버그로 안내 문구가 본문으로 저장되었던 경우, history의 정상 스냅샷으로 복구
        const validSnap = n.history.find(
          (h) => h.content && !this.isCorruptedPlaceholder(h.content)
        );
        if (validSnap) {
          let restored = validSnap.content;
          if (this.isEncrypted(restored)) {
            restored = await this.decrypt(restored);
          }
          content = restored;
        }
      }
      let history = n.history;
      if (Array.isArray(history) && history.length > 0) {
        history = await Promise.all(
          history.map(async (h) => {
            if (h.content && this.isEncrypted(h.content)) {
              return { ...h, content: await this.decrypt(h.content) };
            }
            return h;
          })
        );
      }
      result.push({ ...n, content, history });
    }
    return result;
  }
}

export const CryptoService = new CryptoServiceSingleton();
