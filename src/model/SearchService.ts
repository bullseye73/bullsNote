// MODEL: 스마트 검색 엔진 (초성 검색, 다중 토큰 AND, 연산자 파싱, 관련도 랭킹, 문맥 스니펫)
import { Note, Project } from './Note';
import { CryptoService } from './CryptoService';
import { noteBodyText } from './HashtagService';

// 한글 초성 목록 (19개)
export const CHOSEONG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const CHOSEONG_SET = new Set(CHOSEONG_LIST);

/** 한글 문자열을 초성 문자열로 변환 (영문/숫자/기호는 소문자로 유지) */
export function toChoseong(str: string): string {
  if (!str) return '';
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 한글 음절 유니코드 범위: 0xAC00 (가) ~ 0xD7A3 (힣)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      res += CHOSEONG_LIST[idx] ?? str[i];
    } else {
      res += str[i].toLowerCase();
    }
  }
  return res;
}

/** 주어진 문자열이 순수 한글 초성으로만 이루어져 있는지 판별 (공백 제외) */
export function isChoseongOnly(str: string): boolean {
  if (!str) return false;
  const trimmed = str.replace(/\s+/g, '');
  if (!trimmed) return false;
  for (const ch of trimmed) {
    if (!CHOSEONG_SET.has(ch)) return false;
  }
  return true;
}

/** 일반 문자열 및 초성 매칭 검사 */
export function matchTextOrChoseong(targetText: string, token: string): boolean {
  if (!token) return true;
  if (!targetText) return false;

  const lowerTarget = targetText.toLowerCase();
  const lowerToken = token.toLowerCase();

  // 1. 일반 부분 일치 (대소문자 무시)
  if (lowerTarget.includes(lowerToken)) return true;

  // 2. 초성 매칭 (검색어가 순수 초성으로 구성된 경우)
  if (isChoseongOnly(lowerToken)) {
    const targetChoseong = toChoseong(targetText);
    const cleanToken = lowerToken.replace(/\s+/g, '');
    if (targetChoseong.includes(lowerToken) || targetChoseong.replace(/\s+/g, '').includes(cleanToken)) {
      return true;
    }
  }

  return false;
}

/**
 * 텍스트 내에서 일반 키워드 및 한글 초성 매칭 구간을 찾아 중첩 구간을 병합한 [start, end] 배열 반환
 */
export function findMatchRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (!text || !tokens || tokens.length === 0) {
    return [];
  }

  const matchRanges: Array<[number, number]> = [];
  const lowerText = text.toLowerCase();
  const choseongText = toChoseong(text);

  for (const rawToken of tokens) {
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;

    // 1. 초성 검색인 경우 (예: "ㅎㅇ" -> "회의" 위치 감지)
    if (isChoseongOnly(token)) {
      let searchIdx = 0;
      while (searchIdx < choseongText.length) {
        const found = choseongText.indexOf(token, searchIdx);
        if (found === -1) break;
        matchRanges.push([found, found + token.length]);
        searchIdx = found + token.length;
      }
      continue;
    }

    // 2. 일반 텍스트 부분 일치
    let searchIdx = 0;
    while (searchIdx < lowerText.length) {
      const found = lowerText.indexOf(token, searchIdx);
      if (found === -1) break;
      matchRanges.push([found, found + token.length]);
      searchIdx = found + token.length;
    }
  }

  if (matchRanges.length === 0) {
    return [];
  }

  // 중첩되거나 겹치는 구간 병합 (Merge Intervals)
  matchRanges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  let current = matchRanges[0];

  for (let i = 1; i < matchRanges.length; i++) {
    const next = matchRanges[i];
    if (next[0] <= current[1]) {
      current[1] = Math.max(current[1], next[1]);
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

/** 고급 검색 쿼리 구조체 */
export interface ParsedQuery {
  raw: string;
  tokens: string[]; // 일반 검색 토큰 (공백 기준 분리)
  tags: string[]; // tag:xxx 또는 #xxx
  project?: string; // project:xxx, proj:xxx 또는 @xxx
  isFavorite?: boolean; // is:fav, is:favorite
  isPinned?: boolean; // is:pin, is:pinned
  hasReminder?: boolean; // has:reminder, has:alarm
  hasAttachment?: boolean; // has:file, has:attachment
  isEmpty: boolean;
}

/** 검색어 파싱: 연산자(tag:, project:, is:, has:) 및 일반 검색어 분리 */
export function parseSearchQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      raw: '',
      tokens: [],
      tags: [],
      isEmpty: true,
    };
  }

  const parts = trimmed.split(/\s+/);
  const tokens: string[] = [];
  const tags: string[] = [];
  let project: string | undefined;
  let isFavorite: boolean | undefined;
  let isPinned: boolean | undefined;
  let hasReminder: boolean | undefined;
  let hasAttachment: boolean | undefined;

  for (const part of parts) {
    const lower = part.toLowerCase();

    // 1. tag: 또는 tags: 또는 # 접두사
    if (lower.startsWith('tag:') || lower.startsWith('tags:')) {
      const val = part.slice(part.indexOf(':') + 1).replace(/^#/, '').trim();
      if (val) tags.push(val.toLowerCase());
      continue;
    }
    if (part.startsWith('#') && part.length > 1) {
      tags.push(part.slice(1).toLowerCase());
      continue;
    }

    // 2. project: 또는 proj: 또는 @ 접두사
    if (lower.startsWith('project:') || lower.startsWith('proj:')) {
      const val = part.slice(part.indexOf(':') + 1).trim();
      if (val) project = val.toLowerCase();
      continue;
    }
    if (part.startsWith('@') && part.length > 1) {
      project = part.slice(1).toLowerCase();
      continue;
    }

    // 3. is: 연산자
    if (lower === 'is:fav' || lower === 'is:favorite') {
      isFavorite = true;
      continue;
    }
    if (lower === 'is:unfav' || lower === 'is:unfavorite') {
      isFavorite = false;
      continue;
    }
    if (lower === 'is:pin' || lower === 'is:pinned') {
      isPinned = true;
      continue;
    }
    if (lower === 'is:unpin' || lower === 'is:unpinned') {
      isPinned = false;
      continue;
    }

    // 4. has: 연산자
    if (lower === 'has:reminder' || lower === 'has:alarm') {
      hasReminder = true;
      continue;
    }
    if (lower === 'has:file' || lower === 'has:attachment' || lower === 'has:attachments') {
      hasAttachment = true;
      continue;
    }

    // 일반 텍스트 토큰
    tokens.push(part);
  }

  return {
    raw: trimmed,
    tokens,
    tags,
    project,
    isFavorite,
    isPinned,
    hasReminder,
    hasAttachment,
    isEmpty:
      tokens.length === 0 &&
      tags.length === 0 &&
      !project &&
      isFavorite === undefined &&
      isPinned === undefined &&
      hasReminder === undefined &&
      hasAttachment === undefined,
  };
}

/** 검색 일치 결과 및 관련도 점수 */
export interface SearchResultItem {
  note: Note;
  score: number;
  matchedTokens: string[];
  snippet: string;
}

/**
 * 노트 검색 및 관련도(Relevance) 기반 정렬
 */
export function searchNotes(
  notes: Note[],
  query: string,
  projects: Project[] = [],
  options?: {
    scope?: 'all' | 'current';
    selectedProjectId?: string;
  },
): SearchResultItem[] {
  const parsed = parseSearchQuery(query);
  const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]));

  // 프로젝트 범위 필터
  const baseNotes =
    options?.scope === 'current' && options.selectedProjectId
      ? notes.filter((n) => (n.projectId || 'default') === options.selectedProjectId)
      : notes;

  if (parsed.isEmpty) {
    return baseNotes.map((n) => ({
      note: n,
      score: 0,
      matchedTokens: [],
      snippet: getSearchSnippet(n.content, []),
    }));
  }

  const results: SearchResultItem[] = [];

  for (const note of baseNotes) {
    // 1. 상태 필터 (is:, has:)
    if (parsed.isFavorite !== undefined && note.favorite !== parsed.isFavorite) {
      continue;
    }
    if (parsed.isPinned !== undefined && note.pinned !== parsed.isPinned) {
      continue;
    }
    if (parsed.hasReminder && (!note.reminder || note.reminder.dismissed)) {
      continue;
    }
    if (parsed.hasAttachment && (!note.attachments || note.attachments.length === 0)) {
      continue;
    }

    // 2. 프로젝트 필터 (project: 또는 @)
    if (parsed.project) {
      const proj = projectMap.get(note.projectId || 'default');
      const projName = proj?.name.toLowerCase() || '';
      const projId = (note.projectId || 'default').toLowerCase();
      if (!projName.includes(parsed.project) && !projId.includes(parsed.project)) {
        continue;
      }
    }

    // 3. 태그 필터 (tag: 또는 #)
    if (parsed.tags.length > 0) {
      const noteTagsLower = note.tags.map((t) => t.toLowerCase());
      const hasAllTags = parsed.tags.every((reqTag) =>
        noteTagsLower.some((nt) => nt.includes(reqTag))
      );
      if (!hasAllTags) {
        continue;
      }
    }

    // 4. 일반 텍스트 토큰 (다중 단어 AND 매칭)
    let matchedAllTokens = true;
    let score = 0;
    const matchedTokens: string[] = [];

    const title = note.title || '';
    const notePlainContent =
      !CryptoService.isEncrypted(note.content) && !CryptoService.isCorruptedPlaceholder(note.content)
        ? noteBodyText(note.content)
        : '';
    const noteTagsStr = note.tags.join(' ');
    const projName = projectMap.get(note.projectId || 'default')?.name || '';
    const attachmentNames = (note.attachments || []).map((a) => a.name).join(' ');

    for (const token of parsed.tokens) {
      let tokenMatched = false;

      // (1) 제목 검사 (가장 높은 가중치)
      if (title.toLowerCase() === token.toLowerCase()) {
        score += 150;
        tokenMatched = true;
      } else if (title.toLowerCase().startsWith(token.toLowerCase())) {
        score += 80;
        tokenMatched = true;
      } else if (matchTextOrChoseong(title, token)) {
        score += 50;
        tokenMatched = true;
      }

      // (2) 태그 검사
      if (matchTextOrChoseong(noteTagsStr, token)) {
        score += 35;
        tokenMatched = true;
      }

      // (3) 본문 내용 검사
      if (notePlainContent && matchTextOrChoseong(notePlainContent, token)) {
        score += 20;
        tokenMatched = true;
        // 본문 내 빈도 가산 (최대 15점)
        const count = (notePlainContent.toLowerCase().match(new RegExp(token.toLowerCase(), 'g')) || []).length;
        score += Math.min(count * 3, 15);
      }

      // (4) 첨부파일 이름 검사
      if (attachmentNames && matchTextOrChoseong(attachmentNames, token)) {
        score += 25;
        tokenMatched = true;
      }

      // (5) 소속 프로젝트명 검사 (전체 검색 시)
      if (projName && matchTextOrChoseong(projName, token)) {
        score += 15;
        tokenMatched = true;
      }

      if (!tokenMatched) {
        matchedAllTokens = false;
        break;
      } else {
        matchedTokens.push(token);
      }
    }

    if (!matchedAllTokens) {
      continue;
    }

    // 추가 보너스 점수
    if (note.pinned) score += 10;
    if (note.favorite) score += 8;

    // 최근 7일 내 수정된 노트 약한 보너스
    const daysOld = (Date.now() - note.updatedAt) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) {
      score += Math.max(0, 7 - Math.floor(daysOld));
    }

    const snippet = getSearchSnippet(note.content, parsed.tokens);

    results.push({
      note,
      score,
      matchedTokens,
      snippet,
    });
  }

  // 관련도 점수 내림차순 정렬 (동점 시 최신 수정일순)
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.note.updatedAt - a.note.updatedAt;
  });
}

/**
 * 검색어가 포함된 문맥 스니펫 추출 (앞뒤 30~50자 포함)
 */
export function getSearchSnippet(
  content: string,
  tokens: string[],
  maxLen = 120,
): string {
  if (CryptoService.isEncrypted(content) || CryptoService.isCorruptedPlaceholder(content)) {
    return '🔒 암호화된 노트입니다.';
  }

  const plain = noteBodyText(content);
  if (!plain) return '내용 없음';

  if (!tokens || tokens.length === 0) {
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
  }

  // 첫 번째 일치하는 텍스트 토큰의 인덱스 검색
  let earliestIdx = -1;
  const lower = plain.toLowerCase();

  for (const t of tokens) {
    if (!t) continue;
    // 초성 검색인 경우
    if (isChoseongOnly(t)) {
      const choseongPlain = toChoseong(plain);
      const idx = choseongPlain.indexOf(t.toLowerCase());
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
      }
    } else {
      const idx = lower.indexOf(t.toLowerCase());
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
      }
    }
  }

  if (earliestIdx === -1) {
    // 본문에서 직접 찾지 못했으면 시작부 120자 반환
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
  }

  // 검색어 앞뒤 문맥 추출
  const start = Math.max(0, earliestIdx - 30);
  const end = Math.min(plain.length, start + maxLen);
  let snippet = plain.slice(start, end);

  if (start > 0) snippet = '…' + snippet;
  if (end < plain.length) snippet = snippet + '…';

  return snippet;
}
