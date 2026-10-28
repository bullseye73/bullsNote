// MODEL: 노트 트리 계층 구조 분석, 자손 계산, 관계 탐색 및 요약 텍스트 최적화 유틸리티
import { Note } from './Note';
import { CryptoService } from './CryptoService';
import { noteBodyText } from './HashtagService';

export interface NoteHierarchy {
  byId: Map<string, Note>;
  childrenMap: Map<string, Note[]>;
  descendantCounts: Map<string, number>;
  isDescendant(ancestorId: string, potentialChildId: string): boolean;
  getPathNodes(id: string): Note[];
  getPathTitles(id: string): string[];
}

/**
 * 전체 노트 목록으로부터 단 1회(O(N))의 순회로 모든 노드의 부모-자식 관계,
 * 자손 개수(descendantCounts), 부모 경로 추적을 일괄 사전 계산하는 고성능 계층 구조 빌더
 */
export function buildNoteHierarchy(notes: Note[]): NoteHierarchy {
  const byId = new Map<string, Note>();
  const childrenMap = new Map<string, Note[]>();

  // 1. O(N)으로 byId 및 1차 직속 자식 목록 구축
  for (const n of notes) {
    byId.set(n.id, n);
    if (n.parentId) {
      let list = childrenMap.get(n.parentId);
      if (!list) {
        list = [];
        childrenMap.set(n.parentId, list);
      }
      list.push(n);
    }
  }

  // 2. 후위 순회(Post-order memoization)로 모든 노드의 전체 자손 수(descendantCounts)를 O(N)으로 일괄 계산
  const descendantCounts = new Map<string, number>();
  const visited = new Set<string>();

  function countDescendants(id: string): number {
    if (descendantCounts.has(id)) {
      return descendantCounts.get(id)!;
    }
    if (visited.has(id)) {
      // 순환 참조(Cycle) 방어
      return 0;
    }
    visited.add(id);

    const children = childrenMap.get(id) || [];
    let count = children.length;
    for (const child of children) {
      count += countDescendants(child.id);
    }

    descendantCounts.set(id, count);
    visited.delete(id);
    return count;
  }

  for (const n of notes) {
    if (!descendantCounts.has(n.id)) {
      countDescendants(n.id);
    }
  }

  // 3. O(depth) Map 기반 자손 여부 확인 (기존 O(depth * N)의 notes.find 대체)
  function isDescendant(ancestorId: string, potentialChildId: string): boolean {
    if (!ancestorId || !potentialChildId || ancestorId === potentialChildId) return false;
    let cur = byId.get(potentialChildId);
    const seen = new Set<string>();
    while (cur && cur.parentId && !seen.has(cur.parentId)) {
      if (cur.parentId === ancestorId) return true;
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    return false;
  }

  // 4. 루트부터 대상 노드까지의 경로 배열 (브레드크럼)
  function getPathNodes(id: string): Note[] {
    const path: Note[] = [];
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
  }

  function getPathTitles(id: string): string[] {
    return getPathNodes(id).map((n) => n.title || '제목 없음');
  }

  return {
    byId,
    childrenMap,
    descendantCounts,
    isDescendant,
    getPathNodes,
    getPathTitles,
  };
}

/**
 * cleanExcerpt 캐시 (최대 1000개 유지)
 * 매 렌더링마다 발생하는 블록 JSON 파싱 및 정규식 연산(4회) 중복 실행을 방지
 */
const EXCERPT_CACHE_MAX = 1000;
const excerptCache = new Map<string, string>();

/**
 * 노트 본문에서 UI 카드 미리보기에 적합한 1줄 텍스트 요약을 추출 (캐시 적용)
 */
export function cleanExcerpt(content: string, title?: string): string {
  if (!content) return '';
  if (CryptoService.isEncrypted(content) || CryptoService.isCorruptedPlaceholder(content)) {
    return '🔒 암호화된 노트';
  }

  // 캐시 키: 본문 해시 대체 (길이 + 앞 64자 + 뒤 64자 + title)
  const cacheKey = `${content.length}:${content.slice(0, 64)}:${content.slice(-64)}:${title || ''}`;
  const cached = excerptCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let t = noteBodyText(content);
  // 할일 템플릿 메타 헤더 안내 텍스트들 및 장식 제거
  t = t
    .replace(/📌\s*원본\s*노트:[^\n]*/g, '')
    .replace(/⏰\s*작성\s*일시:[^\n]*/g, '')
    .replace(/📝\s*세부\s*내용\s*및\s*작업\s*메모/g, '')
    .replace(/💡\s*작업\s*세부\s*내용\s*및\s*진행\s*메모[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 제목과 동일한 텍스트만 남아있으면 제거 (추가 메모가 없는 경우)
  if (title && t.trim() === title.trim()) {
    t = '';
  }

  // 캐시 크기 관리
  if (excerptCache.size >= EXCERPT_CACHE_MAX) {
    const firstKey = excerptCache.keys().next().value;
    if (firstKey) excerptCache.delete(firstKey);
  }
  excerptCache.set(cacheKey, t);

  return t;
}
