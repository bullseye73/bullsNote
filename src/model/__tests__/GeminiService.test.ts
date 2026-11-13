import { beforeEach, describe, expect, it } from 'vitest';
import { GeminiService } from '../GeminiService';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('GeminiService.isConfigured', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });

  it('API 키가 없으면 false', () => {
    expect(GeminiService.isConfigured()).toBe(false);
  });

  it('공백뿐인 키는 false, 키가 있으면 true', () => {
    GeminiService.saveConfig({ apiKey: '   ' });
    expect(GeminiService.isConfigured()).toBe(false);
    GeminiService.saveConfig({ apiKey: 'abc' });
    expect(GeminiService.isConfigured()).toBe(true);
  });
});
