// VIEW: 노트 체크리스트 항목 오른쪽에 할일 연결 상태를 띄우는 오버레이
// - 연결된 항목: "할일 · M/D" / "완료" 배지 (누르면 상세)
// - 연결 안 된 항목: "+ 할일로" (그 항목 하나만 할일로 등록)
import { Badge, Box, UnstyledButton } from '@mantine/core';
import { IconLink, IconPlus } from '@tabler/icons-react';
import type { BlockNoteEditor } from '@blocknote/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { computeEffectivePlannerMap } from '../model/PlannerService';
import { buildTaskItems, getLinkedTodosByBlock } from '../model/TaskQueryService';

type AnyEditor = BlockNoteEditor<any, any, any>;

interface Anchor {
  blockId: string;
  top: number;
  height: number;
  right: number;
}

interface ChecklistTodoOverlayProps {
  editor: AnyEditor;
  noteId: string;
  container: HTMLElement | null;
  onLink: (blockId: string) => void;
  onOpenTodo: (todoId: string) => void;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
};

export function ChecklistTodoOverlay({ editor, noteId, container, onLink, onOpenTodo }: ChecklistTodoOverlayProps) {
  const { notes, customHolidays } = useNotes();
  const [anchors, setAnchors] = useState<Anchor[]>([]);

  const linked = useMemo(
    () => getLinkedTodosByBlock(noteId, buildTaskItems(notes, computeEffectivePlannerMap(notes, customHolidays))),
    [noteId, notes, customHolidays]
  );

  const measure = useCallback(() => {
    if (!container) return;
    const base = container.getBoundingClientRect();
    const next: Anchor[] = [];
    container.querySelectorAll<HTMLElement>('.bn-block-content[data-content-type="checkListItem"]').forEach((el) => {
      const blockId = el.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!blockId) return;
      const r = el.getBoundingClientRect();
      next.push({
        blockId,
        top: r.top - base.top + container.scrollTop,
        height: r.height,
        right: base.right - r.right,
      });
    });
    setAnchors(next);
  }, [container]);

  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    const unsubscribe = editor.onChange(schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    const content = container.querySelector('.bn-editor');
    if (content) ro.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [container, editor, measure]);

  if (anchors.length === 0) return null;

  return (
    <Box
      className="no-print"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 0, pointerEvents: 'none', zIndex: 3 }}
    >
      {anchors.map((a) => {
        const todo = linked.get(a.blockId);
        const closed = todo && (todo.status === 'done' || todo.status === 'drop');
        return (
          <Box
            key={a.blockId}
            style={{
              position: 'absolute',
              top: a.top,
              right: a.right + 4,
              height: a.height,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'auto',
            }}
          >
            {todo ? (
              <UnstyledButton onClick={() => onOpenTodo(todo.note.id)} aria-label="연결된 할일 열기">
                <Badge
                  size="sm"
                  variant="light"
                  color={closed ? 'teal' : 'blue'}
                  leftSection={<IconLink size={11} />}
                  style={{ cursor: 'pointer', textTransform: 'none' }}
                >
                  {closed ? '완료' : todo.dueDate ? `할일 · ${shortDate(todo.dueDate)}` : '할일'}
                </Badge>
              </UnstyledButton>
            ) : (
              <UnstyledButton
                className="bn-checklist-link-btn"
                onClick={() => onLink(a.blockId)}
                aria-label="이 항목을 할일로 만들기"
              >
                <Badge
                  size="sm"
                  variant="outline"
                  color="gray"
                  leftSection={<IconPlus size={11} />}
                  style={{ cursor: 'pointer', borderStyle: 'dashed', textTransform: 'none' }}
                >
                  할일로
                </Badge>
              </UnstyledButton>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
