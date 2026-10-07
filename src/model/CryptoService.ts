// MODEL: Web Crypto API 기반 종단간 암호화(E2EE) 서비스 (AES-GCM 256 + PBKDF2)
import { Note } from './Note';

const VERIFIER_STORAGE_KEY = 'bullsnote.security.verifier.v1';
const VERIFY_PAYLOAD = 'BULLSNOTE_KEY_VALIDATION_TOKEN';
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
  /** 현재 메모리에 캐시된 대칭키 (페이지 새로고침 시 초기화되므로 비밀번호 재입력 필요) */
  private cachedKey: CryptoKey | null = null;
  private currentSalt: Uint8Array | null = null;

  /** 암호화 데이터 여부 확인 */
  isEncrypted(text: string): boolean {
    return typeof text === 'string' && text.startsWith(ENC_PREFIX);
  }

  /** 마스터 비밀번호가 설정되어 있는지 여부 */
  isMasterPasswordSet(): boolean {
    try {
      return !!localStorage.getItem(VERIFIER_STORAGE_KEY);
    } catch {
      return false;
    }
  }

  /** 현재 세션이 잠금 해제(복호화 키 메모리 보유) 상태인지 여부 */
  isUnlocked(): boolean {
    return this.cachedKey !== null;
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

  /** 마스터 비밀번호 최초 설정 */
  async setupMasterPassword(password: string): Promise<boolean> {
    if (!password || password.length < 4) {
      throw new Error('비밀번호는 최소 4자리 이상이어야 합니다.');
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await this.deriveKey(password, salt);

    // 검증용 토큰 암호화
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encryptedToken = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      enc.encode(VERIFY_PAYLOAD)
    );

    const verifierString = `${ENC_PREFIX}${arrayBufferToHex(salt)}:${arrayBufferToHex(iv)}:${arrayBufferToBase64(encryptedToken)}`;
    localStorage.setItem(VERIFIER_STORAGE_KEY, verifierString);

    this.cachedKey = key;
    this.currentSalt = salt;
    return true;
  }

  /** 마스터 비밀번호로 잠금 해제 */
  async unlock(password: string): Promise<boolean> {
    const verifier = localStorage.getItem(VERIFIER_STORAGE_KEY);
    if (!verifier || !this.isEncrypted(verifier)) {
      throw new Error('설정된 마스터 비밀번호가 없습니다.');
    }

    try {
      const parts = verifier.slice(ENC_PREFIX.length).split(':');
      if (parts.length !== 3) throw new Error('잘못된 보안 토큰 형식입니다.');

      const salt = new Uint8Array(hexToArrayBuffer(parts[0]));
      const iv = new Uint8Array(hexToArrayBuffer(parts[1]));
      const ciphertext = base64ToArrayBuffer(parts[2]);

      const key = await this.deriveKey(password, salt);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        ciphertext
      );

      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      if (decryptedText !== VERIFY_PAYLOAD) {
        return false;
      }

      this.cachedKey = key;
      this.currentSalt = salt;
      return true;
    } catch (err) {
      console.warn('비밀번호 검증 실패:', err);
      return false;
    }
  }

  /** 앱 수동 잠금 (메모리에서 키 폐기) */
  lock(): void {
    this.cachedKey = null;
    this.currentSalt = null;
  }

  /** 보안 해제 (마스터 비밀번호 제거) */
  removeMasterPassword(): void {
    localStorage.removeItem(VERIFIER_STORAGE_KEY);
    this.lock();
  }

  /** 평문 텍스트 -> AES-GCM 256 암호화 (마스터 키 없으면 원본 반환) */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    // 이미 암호화된 경우 중복 암호화 방지
    if (this.isEncrypted(plaintext)) return plaintext;

    // 마스터 비밀번호가 설정되어 있지 않거나 언락되지 않은 경우 원본 반환
    if (!this.cachedKey) return plaintext;

    try {
      const salt = this.currentSalt || window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        this.cachedKey,
        enc.encode(plaintext)
      );

      return `${ENC_PREFIX}${arrayBufferToHex(salt)}:${arrayBufferToHex(iv)}:${arrayBufferToBase64(ciphertext)}`;
    } catch (err) {
      console.error('암호화 실패:', err);
      throw new Error('노트 본문 암호화에 실패했습니다.');
    }
  }

  /** 암호문 -> 평문 텍스트 복호화 (암호화 안 된 데이터면 원본 반환) */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext) return '';
    // 암호화되지 않은 기존 일반 텍스트는 그대로 반환 (하위 호환성)
    if (!this.isEncrypted(ciphertext)) return ciphertext;

    // 아직 잠금 해제되지 않은 경우 잠금 안내
    if (!this.cachedKey) {
      return JSON.stringify([
        {
          type: 'paragraph',
          content: '🔒 암호화된 노트입니다. 상단 자물쇠 버튼을 눌러 마스터 비밀번호로 잠금을 해제하세요.',
        },
      ]);
    }

    try {
      const parts = ciphertext.slice(ENC_PREFIX.length).split(':');
      if (parts.length !== 3) return ciphertext;

      const iv = new Uint8Array(hexToArrayBuffer(parts[1]));
      const data = base64ToArrayBuffer(parts[2]);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        this.cachedKey,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.error('복호화 실패:', err);
      return JSON.stringify([
        {
          type: 'paragraph',
          content: '🔒 복호화에 실패했습니다. 올바른 마스터 비밀번호로 잠금을 해제해주세요.',
        },
      ]);
    }
  }

  /** 복수 노트 일괄 암호화 */
  async encryptNotes(notes: Note[]): Promise<Note[]> {
    if (!this.cachedKey) return notes;
    const result: Note[] = [];
    for (const n of notes) {
      if (this.isEncrypted(n.content)) {
        result.push(n);
      } else {
        const encrypted = await this.encrypt(n.content);
        result.push({ ...n, content: encrypted });
      }
    }
    return result;
  }

  /** 복수 노트 일괄 복호화 */
  async decryptNotes(notes: Note[]): Promise<Note[]> {
    if (!this.cachedKey) return notes;
    const result: Note[] = [];
    for (const n of notes) {
      if (this.isEncrypted(n.content)) {
        const decrypted = await this.decrypt(n.content);
        result.push({ ...n, content: decrypted });
      } else {
        result.push(n);
      }
    }
    return result;
  }
}

export const CryptoService = new CryptoServiceSingleton();
