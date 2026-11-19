import { describe, expect, it } from 'vitest';
import { createEmptyNote } from '../Note';
import {
  mergeRemoteWindowNote,
  parsePopoutParams,
  removeRemoteWindowNote,
} from '../NoteWindowSync';

describe('NoteWindowSync', () => {
  describe('parsePopoutParams', () => {
    it('빈 쿼리나 일반 URL에서는 isPopout=false를 반환한다', () => {
      expect(parsePopoutParams('')).toEqual({ isPopout: false, noteId: null });
      expect(parsePopoutParams('?foo=bar')).toEqual({ isPopout: false, noteId: null });
      expect(parsePopoutParams('?popout=0&noteId=n1')).toEqual({ isPopout: false, noteId: 'n1' });
    });

    it('popout=1과 noteId가 있으면 독립 창 파라미터를 파싱한다', () => {
      expect(parsePopoutParams('?popout=1&noteId=note-123')).toEqual({
        isPopout: true,
        noteId: 'note-123',
      });
      expect(parsePopoutParams('?popout=1&noteId=%20note-xyz%20')).toEqual({
        isPopout: true,
        noteId: 'note-xyz',
      });
    });

    it('noteId가 비어있거나 누락되면 noteId=null로 처리한다', () => {
      expect(parsePopoutParams('?popout=1')).toEqual({ isPopout: true, noteId: null });
      expect(parsePopoutParams('?popout=1&noteId=%20%20')).toEqual({ isPopout: true, noteId: null });
    });
  });

  describe('mergeRemoteWindowNote', () => {
    it('로컬에 없는 노트를 수신하면 목록 앞에 추가한다', () => {
      const existing = createEmptyNote({ id: 'n1', title: '기존 노트', updatedAt: 1000 });
      const incoming = createEmptyNote({ id: 'n2', title: '새 노트', updatedAt: 2000 });

      const res = mergeRemoteWindowNote([existing], incoming);
      expect(res.changed).toBe(true);
      expect(res.appliedNote?.id).toBe('n2');
      expect(res.notes.map((n) => n.id)).toEqual(['n2', 'n1']);
    });

    it('수신된 노트의 updatedAt이 더 최신이면 기존 노트를 갱신한다', () => {
      const existing = createEmptyNote({ id: 'n1', title: '구버전', updatedAt: 1000 });
      const incoming = createEmptyNote({ id: 'n1', title: '신버전', updatedAt: 2000 });

      const res = mergeRemoteWindowNote([existing], incoming);
      expect(res.changed).toBe(true);
      expect(res.appliedNote?.title).toBe('신버전');
      expect(res.notes[0].title).toBe('신버전');
    });

    it('수신된 노트의 updatedAt이 같거나 오래되었으면 무시한다', () => {
      const existing = createEmptyNote({ id: 'n1', title: '최신', updatedAt: 2000 });
      const list = [existing];

      const sameRes = mergeRemoteWindowNote(list, { ...existing, title: '동일시각' });
      expect(sameRes.changed).toBe(false);
      expect(sameRes.appliedNote).toBeNull();
      expect(sameRes.notes).toBe(list);

      const olderRes = mergeRemoteWindowNote(list, { ...existing, title: '과거', updatedAt: 1000 });
      expect(olderRes.changed).toBe(false);
      expect(olderRes.appliedNote).toBeNull();
      expect(olderRes.notes).toBe(list);
    });
  });

  describe('removeRemoteWindowNote', () => {
    it('삭제된 노트와 하위 노트를 함께 제거한다', () => {
      const parent = createEmptyNote({ id: 'p1', title: '부모', parentId: null });
      const child = createEmptyNote({ id: 'c1', title: '자식', parentId: 'p1' });
      const other = createEmptyNote({ id: 'o1', title: '다른 노트', parentId: null });

      const res = removeRemoteWindowNote([parent, child, other], 'p1');
      expect(res.changed).toBe(true);
      expect(res.removedIds.has('p1')).toBe(true);
      expect(res.removedIds.has('c1')).toBe(true);
      expect(res.notes.map((n) => n.id)).toEqual(['o1']);
    });

    it('존재하지 않는 ID면 변경 없음으로 반환한다', () => {
      const note = createEmptyNote({ id: 'n1', title: '노트' });
      const list = [note];
      const res = removeRemoteWindowNote(list, 'missing');
      expect(res.changed).toBe(false);
      expect(res.notes).toBe(list);
    });
  });
});
