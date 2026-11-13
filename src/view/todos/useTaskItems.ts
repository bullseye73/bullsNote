// VIEW HOOK: 할일 카드 목록과 공용 동작 (오늘 대시보드·할일 화면 공용)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotes } from '../../controller/NotesController';
import { computeEffectivePlannerMap, getTodayIsoStr } from '../../model/PlannerService';
import { buildTaskItems, type TaskItem } from '../../model/TaskQueryService';

/** 자정을 넘기면 오늘 날짜가 바뀌도록 1분마다 확인 */
export function useTodayIso(): string {
  const [today, setToday] = useState(getTodayIsoStr);
  useEffect(() => {
    const t = setInterval(() => setToday(getTodayIsoStr()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export function useTaskItems() {
  const { notes, customHolidays, changeTodoStatus, select, openNote } = useNotes();
  const todayIso = useTodayIso();

  const items: TaskItem[] = useMemo(
    () => buildTaskItems(notes, computeEffectivePlannerMap(notes, customHolidays)),
    [notes, customHolidays]
  );
  const titleById = useMemo(() => new Map(notes.map((n) => [n.id, n.title])), [notes]);

  // 상세 패널(오른쪽 드로어) 열림 상태
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback(
    (noteId: string) => {
      select(noteId);
      setDetailOpen(true);
    },
    [select]
  );

  const toggleDone = useCallback(
    (noteId: string, done: boolean) => changeTodoStatus(noteId, done ? 'done' : 'todo'),
    [changeTodoStatus]
  );

  const sourceTitleOf = useCallback(
    (item: TaskItem) => (item.sourceNoteId ? titleById.get(item.sourceNoteId) ?? null : null),
    [titleById]
  );

  return {
    items,
    notes,
    todayIso,
    detailOpen,
    openDetail,
    closeDetail: () => setDetailOpen(false),
    toggleDone,
    openSource: openNote,
    sourceTitleOf,
  };
}
