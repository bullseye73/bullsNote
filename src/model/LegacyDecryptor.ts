// MODEL: 기존 암호화된 레거시 노트(ENC:v1:...)를 평문으로 영구 복구하는 유틸리티
import { Note } from './Note';
import { extractHashtags } from './HashtagService';

export const VERIFIER_STORAGE_KEY = 'bullsnote.security.verifier.v1';
export const ENC_PREFIX = 'ENC:v1:';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

/** 블록 JSON 안에 ENC:v1:... 문자열이 감싸져 있는 경우에도 암호문만 안전하게 추출 */
export function extractLegacyCiphertext(text: string): string {
  if (!text || typeof text !== 'string') return '';
  if (text.startsWith(ENC_PREFIX)) return text;
  if (text.includes(ENC_PREFIX)) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        for (const block of parsed) {
          const c = block?.content;
          if (typeof c === 'string' && c.startsWith(ENC_PREFIX)) return c;
          if (Array.isArray(c)) {
            for (const inline of c) {
              if (typeof inline?.text === 'string' && inline.text.startsWith(ENC_PREFIX)) {
                return inline.text;
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    const idx = text.indexOf(ENC_PREFIX);
    if (idx !== -1) {
      const match = text.slice(idx).match(/^ENC:v1:[0-9a-fA-F]+:[0-9a-fA-F]+:[A-Za-z0-9+/=]+/);
      if (match) return match[0];
    }
  }
  return text;
}

/** 해당 텍스트가 암호화된 상태인지 확인 */
export function hasLegacyEncryptedText(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return extractLegacyCiphertext(text).startsWith(ENC_PREFIX);
}

/** 노트 배열 중 암호화된 본문이나 히스토리가 하나라도 있는지 확인 */
export function hasAnyEncryptedNotes(notes: Note[]): boolean {
  return notes.some(
    (n) =>
      hasLegacyEncryptedText(n.content) ||
      (Array.isArray(n.history) && n.history.some((h) => hasLegacyEncryptedText(h.content))),
  );
}

async function deriveKey(password: string, saltHex: string): Promise<CryptoKey> {
  const salt = new Uint8Array(hexToArrayBuffer(saltHex));
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
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
    ['decrypt'],
  );
}

/** 단일 암호문 문자열을 비밀번호로 복호화 (성공 시 평문 반환, 실패 시 null) */
export async function tryDecryptCiphertext(
  text: string,
  password: string,
  keyCache = new Map<string, CryptoKey>(),
): Promise<string | null> {
  const raw = extractLegacyCiphertext(text);
  if (!raw.startsWith(ENC_PREFIX)) return text;

  const parts = raw.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) return null;

  const [saltHex, ivHex, cipherB64] = parts;
  try {
    let key = keyCache.get(saltHex);
    if (!key) {
      key = await deriveKey(password, saltHex);
      keyCache.set(saltHex, key);
    }
    const iv = new Uint8Array(hexToArrayBuffer(ivHex));
    const data = base64ToArrayBuffer(cipherB64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      data,
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return null;
  }
}

/**
 * 마스터 비밀번호로 암호화된 모든 노트(및 히스토리)를 일괄 평문 복구
 */
export async function recoverEncryptedNotes(
  notes: Note[],
  password: string,
): Promise<{ success: boolean; recoveredCount: number; notes: Note[] }> {
  if (!password) {
    return { success: false, recoveredCount: 0, notes };
  }

  const keyCache = new Map<string, CryptoKey>();
  let recoveredCount = 0;
  let anySuccess = false;

  const updatedNotes: Note[] = [];

  for (const n of notes) {
    let content = n.content;
    let noteRecovered = false;

    if (hasLegacyEncryptedText(content)) {
      const dec = await tryDecryptCiphertext(content, password, keyCache);
      if (dec !== null) {
        content = dec;
        noteRecovered = true;
        anySuccess = true;
      }
    }

    // 만약 본문이 손상되었거나 복호화되지 않았을 때 히스토리에 평문/암호문 스냅샷이 있으면 복구 시도
    let history = n.history;
    if (Array.isArray(history) && history.length > 0) {
      const nextHistory = [];
      for (const h of history) {
        if (h.content && hasLegacyEncryptedText(h.content)) {
          const decH = await tryDecryptCiphertext(h.content, password, keyCache);
          if (decH !== null) {
            nextHistory.push({ ...h, content: decH });
            anySuccess = true;
            continue;
          }
        }
        nextHistory.push(h);
      }
      history = nextHistory;
    }

    if (noteRecovered) {
      recoveredCount += 1;
      updatedNotes.push({
        ...n,
        content,
        tags: extractHashtags(n.title, content),
        history,
        updatedAt: Date.now(),
      });
    } else {
      updatedNotes.push({
        ...n,
        history,
      });
    }
  }

  if (anySuccess) {
    try {
      localStorage.removeItem(VERIFIER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return {
    success: anySuccess,
    recoveredCount,
    notes: updatedNotes,
  };
}

