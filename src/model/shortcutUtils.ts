// MODEL: 플랫폼 OS 감지 및 단축키(Shortcut) 다국어/플랫폼 대응 유틸리티

export type PlatformType = 'darwin' | 'win32' | 'linux' | 'other';

/**
 * 실행 중인 OS 환경 감지 (Electron 런타임 및 일반 브라우저 환경 모두 지원)
 */
export function detectPlatform(): PlatformType {
  // 1. Electron 환경 (preload window.bullsNote.platform)
  if (typeof window !== 'undefined' && window.bullsNote?.platform) {
    const p = window.bullsNote.platform.toLowerCase();
    if (p.includes('darwin') || p.includes('mac')) return 'darwin';
    if (p.includes('win')) return 'win32';
    if (p.includes('linux')) return 'linux';
  }

  // 2. 브라우저/Navigator 환경
  if (typeof navigator !== 'undefined') {
    const nav = navigator as unknown as {
      userAgentData?: { platform?: string };
      platform?: string;
      userAgent?: string;
    };
    const platform = (nav.userAgentData?.platform || nav.platform || '').toLowerCase();
    const ua = (nav.userAgent || '').toLowerCase();

    if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os x')) {
      return 'darwin';
    }
    if (platform.includes('win') || ua.includes('windows')) {
      return 'win32';
    }
    if (platform.includes('linux') || ua.includes('linux')) {
      return 'linux';
    }
  }

  return 'win32'; // 기본 fallback은 Windows
}

export const PLATFORM: PlatformType = detectPlatform();
export const IS_MAC: boolean = PLATFORM === 'darwin';
export const IS_WINDOWS: boolean = PLATFORM === 'win32';
export const IS_LINUX: boolean = PLATFORM === 'linux';

/**
 * 기본 수정자 키 (Mac: Cmd/⌘, Windows/Linux: Ctrl)
 */
export function getModKeyLabel(options?: { symbol?: boolean }): string {
  if (IS_MAC) {
    return options?.symbol ? '⌘' : 'Cmd';
  }
  return 'Ctrl';
}

/**
 * 단축키 조합 문자열을 현재 OS에 맞춰 포맷팅
 * 
 * 예시:
 * - formatShortcut('Mod+K') -> Mac: "Cmd+K", Win/Linux: "Ctrl+K"
 * - formatShortcut('Mod+K', { symbol: true }) -> Mac: "⌘K", Win/Linux: "Ctrl+K"
 * - formatShortcut('Mod+Alt+C') -> Mac: "Cmd+Alt+C", Win/Linux: "Ctrl+Alt+C"
 * - formatShortcut('Mod+Shift+G') -> Mac: "Cmd+Shift+G", Win/Linux: "Ctrl+Shift+G"
 */
export function formatShortcut(
  spec: string,
  options?: { symbol?: boolean }
): string {
  const symbol = options?.symbol ?? false;

  if (IS_MAC) {
    if (symbol) {
      return spec
        .replace(/Mod\+/gi, '⌘')
        .replace(/Ctrl\+/gi, '⌃')
        .replace(/Alt\+/gi, '⌥')
        .replace(/Shift\+/gi, '⇧')
        .replace(/\+/g, '');
    }
    return spec
      .replace(/Mod/gi, 'Cmd')
      .replace(/Ctrl/gi, 'Ctrl');
  }

  // Windows / Linux
  return spec
    .replace(/Mod/gi, 'Ctrl');
}

/**
 * 앱 전체에서 일관되게 사용할 공통 단축키 포맷 모음
 */
export const SHORTCUTS = {
  // 새 노트
  newNote: formatShortcut('Mod+N'),
  newNoteSymbol: formatShortcut('Mod+N', { symbol: true }),

  // 퀵 검색
  quickSearch: formatShortcut('Mod+K', { symbol: true }),
  quickSearchText: formatShortcut('Mod+K'),

  // Gemini AI 어시스턴트
  geminiAi: formatShortcut('Mod+J', { symbol: true }),
  geminiAiText: formatShortcut('Mod+J'),
  geminiRunKey: IS_MAC ? 'Cmd' : 'Ctrl',

  // 오늘 날짜 삽입
  insertDate: formatShortcut('Mod+;'),
  insertDateBadge: formatShortcut('Mod+;', { symbol: true }),

  // 인쇄 및 미리보기
  print: formatShortcut('Mod+P'),

  // 서식 / 편집
  undo: formatShortcut('Mod+Z'),
  redo: IS_MAC ? 'Cmd+Shift+Z' : 'Ctrl+Y',
  bold: formatShortcut('Mod+B'),
  italic: formatShortcut('Mod+I'),
  underline: formatShortcut('Mod+U'),
  inlineCode: IS_MAC ? 'Cmd+` 또는 Cmd+E' : 'Ctrl+` 또는 Ctrl+E',
  codeBlock: formatShortcut('Mod+Alt+C'),

  // 본문 검색 일치 항목 탐색
  findNext: IS_MAC ? 'Cmd+G, F3' : 'Ctrl+G, F3',
  findPrev: IS_MAC ? 'Cmd+Shift+G, Shift+F3' : 'Ctrl+Shift+G, Shift+F3',
} as const;
