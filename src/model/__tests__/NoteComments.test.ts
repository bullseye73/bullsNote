import { describe, expect, it, beforeEach } from 'vitest';
import { createCommentId, createEmptyNote, DEFAULT_PROJECTS, removeCommentWithReplies } from '../Note';
import { parseNoteFile, serializeNoteFile } from '../FileVault';
import { NoteRepository } from '../NoteRepository';
import { searchNotes } from '../SearchService';

describe('노트 댓글 기능 (모델/영속성/검색)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
      configurable: true,
    });
  });

  it('createEmptyNote는 빈 comments 배열을 초기화하고 createCommentId는 고유 ID를 생성한다', () => {
    const note = createEmptyNote({ title: '테스트 노트' });
    expect(note.comments).toEqual([]);
    const id1 = createCommentId();
    const id2 = createCommentId();
    expect(id1.startsWith('cmt-')).toBe(true);
    expect(id1).not.toBe(id2);
  });

  it('FileVault serializeNoteFile / parseNoteFile 왕복 시 댓글 목록을 보존한다', () => {
    const now = 1700000000000;
    const note = createEmptyNote({
      id: 'note-cmt-1',
      title: '회의록',
      comments: [
        {
          id: 'cmt-1',
          content: '다음 주까지 API 스펙 확정 필요',
          author: '홍길동',
          resolved: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cmt-2',
          content: '확인 완료했습니다',
          author: '김철수',
          resolved: true,
          createdAt: now + 1000,
          updatedAt: now + 2000,
        },
      ],
    });

    const md = serializeNoteFile(note, '본문 내용입니다.');
    const parsed = parseNoteFile(note.id, md);
    expect(parsed).not.toBeNull();
    expect(parsed!.comments).toHaveLength(2);
    expect(parsed!.comments![0]).toMatchObject({
      id: 'cmt-1',
      content: '다음 주까지 API 스펙 확정 필요',
      author: '홍길동',
      resolved: false,
    });
    expect(parsed!.comments![1]).toMatchObject({
      id: 'cmt-2',
      resolved: true,
      updatedAt: now + 2000,
    });
  });

  it('NoteRepository.load는 유효한 댓글만 마이그레이션한다', () => {
    const raw = [
      {
        id: 'n1',
        title: '노트 1',
        content: '',
        comments: [
          { id: 'c1', content: '정상 댓글', createdAt: 100, updatedAt: 100 },
          { id: 'c2', content: 123, createdAt: 100, updatedAt: 100 },
          null,
        ],
      },
    ];
    localStorage.setItem('bullsnote.notes.v1', JSON.stringify(raw));
    const loaded = NoteRepository.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].comments).toHaveLength(1);
    expect(loaded[0].comments![0].content).toBe('정상 댓글');
  });

  it('SearchService.searchNotes는 댓글 본문 키워드로도 노트를 검색한다', () => {
    const note = createEmptyNote({
      id: 'n-search',
      title: '아키텍처 메모',
      content: '기본 본문',
      comments: [
        {
          id: 'cmt-s1',
          content: '성능 병목 프로파일링 결과 첨부 예정',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    const results = searchNotes([note], '프로파일링', DEFAULT_PROJECTS);
    expect(results).toHaveLength(1);
    expect(results[0].note.id).toBe('n-search');
  });

  it('하위 댓글(parentId)을 FileVault 왕복으로 보존하고 부모 삭제 시 하위 댓글도 함께 삭제한다', () => {
    const now = 1700000000000;
    const comments = [
      { id: 'cmt-root', content: '상위 댓글', author: 'A', createdAt: now, updatedAt: now },
      { id: 'cmt-reply-1', content: '하위 답글 1', author: 'B', parentId: 'cmt-root', createdAt: now + 1, updatedAt: now + 1 },
      { id: 'cmt-other', content: '다른 댓글', author: 'C', createdAt: now + 2, updatedAt: now + 2 },
    ];
    const note = createEmptyNote({ id: 'note-thread', comments });
    const parsed = parseNoteFile(note.id, serializeNoteFile(note, '본문'));
    expect(parsed?.comments).toHaveLength(3);
    expect(parsed?.comments?.[1].parentId).toBe('cmt-root');

    const afterDelete = removeCommentWithReplies(comments, 'cmt-root');
    expect(afterDelete.map((c) => c.id)).toEqual(['cmt-other']);
  });
});
