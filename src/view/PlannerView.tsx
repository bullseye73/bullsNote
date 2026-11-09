// VIEW: 플래너 (Schedule / Gantt Chart) - 할일관리 연동 계층형 작업 테이블 + 일별/주별/월별 간트 타임라인
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Drawer,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowsSort,
  IconArrowDown,
  IconArrowUp,
  IconBellRinging,
  IconCalendar,
  IconCalendarEvent,
  IconCalendarStats,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconDots,
  IconEdit,
  IconIndentDecrease,
  IconIndentIncrease,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPalette,
  IconPlus,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import {
  Note,
  PASTEL_COLORS,
  TodoStatus,
  TreeNode,
  buildTree,
  getPastelConfig,
} from '../model/Note';
import {
  EffectiveTaskSchedule,
  PlannerViewScale,
  addCalendarDays,
  computeEffectivePlannerMap,
  diffCalendarDays,
  getDueDateBadgeInfo,
  getHolidayName,
  getTodayIsoStr,
  isNonWorkingDay,
  isWeekendDate,
  parseIsoDateLocal,
  snapToWorkingDay,
} from '../model/PlannerService';
import {
  TODO_GROUPS,
  TODO_PROJECT_ID,
  getEffectiveTodoStatus,
  isSystemGroupNote,
} from '../model/TodoService';
import { NoteEditorView } from './NoteEditorView';

const HEADER_HEIGHT = 58;
const ROW_HEIGHT = 46;
const PLANNER_PREFS_STORAGE_KEY = 'bullsnote.planner.viewPrefs.v1';

export type PlannerSortField = 'title' | 'startDate' | 'duration' | 'dueDate';
export type PlannerSortOrder = 'asc' | 'desc';
export type PlannerStatusFilter = 'all' | 'active' | 'done' | 'urgent';

interface PlannerViewPrefs {
  scale: PlannerViewScale;
  statusFilter: PlannerStatusFilter;
  sortField: PlannerSortField;
  sortOrder: PlannerSortOrder;
  tableCollapsed: boolean;
  collapsedIds: string[];
}

function loadPlannerViewPrefs(): Partial<PlannerViewPrefs> {
  try {
    const raw = localStorage.getItem(PLANNER_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<PlannerViewPrefs>;
  } catch {
    return {};
  }
}

interface FlattenedPlannerRow {
  note: Note;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  prevSibling: boolean;
  hasParent: boolean;
  schedule: EffectiveTaskSchedule;
  parentEndColOffset?: number;
}

export function PlannerView() {
  const {
    notes,
    selectedId,
    select,
    createPlannerTask,
    updateTaskSchedule,
    updateTitle,
    updateColor,
    changeTodoStatus,
    indent,
    outdent,
    remove,
    customHolidays,
    addCustomHoliday,
    removeCustomHoliday,
  } = useNotes();

  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = scheme === 'dark';
  const isMobile = Boolean(useMediaQuery('(max-width: 767px)'));

  const initialPrefs = useMemo(() => loadPlannerViewPrefs(), []);

  // 타임라인 스케일: 일별(day) / 주별(week) / 월별(month) - localStorage 복원
  const [scale, setScale] = useState<PlannerViewScale>(() => {
    const s = initialPrefs.scale;
    return s === 'day' || s === 'week' || s === 'month' ? s : 'day';
  });
  // 상태 필터: 전체(all) / 진행중·대기(active) / 완료(done) / 지연·임박(urgent) - localStorage 복원
  const [statusFilter, setStatusFilter] = useState<PlannerStatusFilter>(() => {
    const f = initialPrefs.statusFilter;
    return f === 'all' || f === 'active' || f === 'done' || f === 'urgent' ? f : 'all';
  });
  // 컬럼 타이틀 클릭 정렬 상태 (오름차순 / 내림차순) - localStorage 복원
  const [sortField, setSortField] = useState<PlannerSortField>(() => {
    const sf = initialPrefs.sortField;
    return sf === 'title' || sf === 'startDate' || sf === 'duration' || sf === 'dueDate'
      ? sf
      : 'startDate';
  });
  const [sortOrder, setSortOrder] = useState<PlannerSortOrder>(() => {
    return initialPrefs.sortOrder === 'desc' ? 'desc' : 'asc';
  });
  // 좌측 작업 테이블 접기/펼치기 (모바일 또는 와이드 타임라인 전용 보기)
  const [tableCollapsed, setTableCollapsed] = useState<boolean>(() =>
    Boolean(initialPrefs.tableCollapsed)
  );
  // 트리 행 접기 상태
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(Array.isArray(initialPrefs.collapsedIds) ? initialPrefs.collapsedIds : [])
  );
  // 우측 노트 상세 에디터 드로어 열림 여부
  const [editorDrawerOpened, setEditorDrawerOpened] = useState(false);

  // 필터·정렬·뷰 스케일·접기 상태 변경 시 localStorage에 자동 저장하여 다음 보기 시 그대로 복원
  useEffect(() => {
    try {
      const prefs: PlannerViewPrefs = {
        scale,
        statusFilter,
        sortField,
        sortOrder,
        tableCollapsed,
        collapsedIds: [...collapsedIds],
      };
      localStorage.setItem(PLANNER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore storage quota errors
    }
  }, [scale, statusFilter, sortField, sortOrder, tableCollapsed, collapsedIds]);

  const handleHeaderSortClick = useCallback(
    (field: PlannerSortField) => {
      if (sortField === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder('asc');
      }
    },
    [sortField]
  );

  // 새 일정 추가 모달 상태
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<TodoStatus>('todo');
  const [newStartDate, setNewStartDate] = useState<string>(() => getTodayIsoStr());
  const [newDuration, setNewDuration] = useState<number>(2);
  const [newUseWorkingDays, setNewUseWorkingDays] = useState<boolean>(true);
  const [newColor, setNewColor] = useState<string>('orange');

  // 사용자 지정 공휴일/휴무일 입력 상태
  const [holidayPopoverOpened, setHolidayPopoverOpened] = useState(false);
  const [holidayDateInput, setHolidayDateInput] = useState<string>(() => getTodayIsoStr());
  const [holidayNameInput, setHolidayNameInput] = useState<string>('');

  // 인라인 제목 편집 상태
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleVal, setEditingTitleVal] = useState<string>('');

  // 타임라인 바 드래그(이동 / 기간 조절) 상태
  const [dragState, setDragState] = useState<{
    noteId: string;
    mode: 'move' | 'resize-end';
    initialX: number;
    origStartDate: string;
    origDueDate: string;
    origDuration: number;
    useWorkingDays: boolean;
    deltaDays: number;
  } | null>(null);

  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef<'left' | 'right' | null>(null);

  const todayStr = useMemo(() => getTodayIsoStr(), []);

  // 1. 할일관리 프로젝트의 모든 일반 작업 노트 추출 및 유효 일정(Roll-up 포함) 계산
  const scheduleMap = useMemo(
    () => computeEffectivePlannerMap(notes, customHolidays),
    [notes, customHolidays]
  );

  const todoTaskNotes = useMemo(() => {
    return notes
      .filter((n) => n.projectId === TODO_PROJECT_ID && !isSystemGroupNote(n))
      .map((n) => {
        // 상위 그룹(To Do, Doing, Done, Drop) 직속인 경우 트리 구성을 위해 parentId를 null로 정규화
        const normalizedParentId =
          n.parentId && isSystemGroupNote(n.parentId) ? null : n.parentId;
        return {
          ...n,
          parentId: normalizedParentId,
        };
      });
  }, [notes]);

  // 컬럼 타이틀 클릭 기준 정렬 (오름차순 / 내림차순)
  const sortPlannerNotes = useCallback(
    (a: Note, b: Note): number => {
      const sa = scheduleMap.get(a.id);
      const sb = scheduleMap.get(b.id);
      const dir = sortOrder === 'asc' ? 1 : -1;

      if (sortField === 'title') {
        const titleA = (a.title || '제목 없음').trim();
        const titleB = (b.title || '제목 없음').trim();
        const cmp = titleA.localeCompare(titleB, 'ko', { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp * dir;
      } else if (sortField === 'startDate' && sa && sb) {
        const cmp = sa.startDate.localeCompare(sb.startDate);
        if (cmp !== 0) return cmp * dir;
      } else if (sortField === 'duration' && sa && sb) {
        const cmp = (sa.durationDays || 1) - (sb.durationDays || 1);
        if (cmp !== 0) return cmp * dir;
      } else if (sortField === 'dueDate' && sa && sb) {
        const cmp = sa.dueDate.localeCompare(sb.dueDate);
        if (cmp !== 0) return cmp * dir;
      }

      if (sa && sb && sa.startDate !== sb.startDate) {
        return sa.startDate.localeCompare(sb.startDate) * dir;
      }
      return ((a.createdAt || 0) - (b.createdAt || 0)) * dir;
    },
    [scheduleMap, sortField, sortOrder]
  );

  const taskTree = useMemo(
    () => buildTree(todoTaskNotes, sortPlannerNotes),
    [todoTaskNotes, sortPlannerNotes]
  );

  // 2. 트리 -> 평탄화된 행 목록 변환 (필터 및 접기 상태 반영)
  const flattenedRows = useMemo(() => {
    const rows: FlattenedPlannerRow[] = [];

    const matchesFilter = (node: TreeNode): boolean => {
      const sched = scheduleMap.get(node.note.id);
      const status = sched?.status || getEffectiveTodoStatus(node.note, notes);
      if (status === 'drop' && statusFilter !== 'all') return false;

      let selfMatch = true;
      if (statusFilter === 'active') {
        selfMatch = status === 'todo' || status === 'doing';
      } else if (statusFilter === 'done') {
        selfMatch = status === 'done';
      } else if (statusFilter === 'urgent') {
        const diff = sched ? diffCalendarDays(todayStr, sched.dueDate) : 999;
        selfMatch = (status === 'todo' || status === 'doing') && diff <= 3;
      }

      if (selfMatch) return true;
      return node.children.some((c) => matchesFilter(c));
    };

    const walk = (nodes: TreeNode[], depth: number, hasParent: boolean) => {
      const visibleNodes = nodes.filter(matchesFilter);
      visibleNodes.forEach((node, idx) => {
        const sched = scheduleMap.get(node.note.id);
        if (!sched) return;
        const isCollapsed = collapsedIds.has(node.note.id);
        rows.push({
          note: node.note,
          depth,
          hasChildren: node.children.length > 0,
          isCollapsed,
          prevSibling: idx > 0,
          hasParent,
          schedule: sched,
        });
        if (node.children.length > 0 && !isCollapsed) {
          walk(node.children, depth + 1, true);
        }
      });
    };

    walk(taskTree, 0, false);
    return rows;
  }, [taskTree, scheduleMap, notes, statusFilter, collapsedIds, todayStr]);

  // 3. KPI 요약 카운트 계산
  const stats = useMemo(() => {
    let total = 0;
    let todo = 0;
    let doing = 0;
    let done = 0;
    let urgent = 0;

    for (const n of todoTaskNotes) {
      const s = scheduleMap.get(n.id);
      if (!s) continue;
      if (s.status === 'drop') continue;
      total++;
      if (s.status === 'todo') todo++;
      else if (s.status === 'doing') doing++;
      else if (s.status === 'done') done++;

      if (s.status === 'todo' || s.status === 'doing') {
        const diff = diffCalendarDays(todayStr, s.dueDate);
        if (diff <= 3) urgent++;
      }
    }
    return { total, todo, doing, done, urgent };
  }, [todoTaskNotes, scheduleMap, todayStr]);

  // 4. 타임라인 날짜 범위 및 스케일별 픽셀 너비 설정
  const dayWidth = scale === 'day' ? 38 : scale === 'week' ? 18 : 7;

  const { timelineStartStr, totalDays, dateList } = useMemo(() => {
    let minDate = addCalendarDays(todayStr, -14);
    let maxDate = addCalendarDays(todayStr, 45);

    for (const row of flattenedRows) {
      if (row.schedule.startDate < minDate) minDate = row.schedule.startDate;
      if (row.schedule.dueDate > maxDate) maxDate = row.schedule.dueDate;
    }

    // 앞뒤 여유 구간 확보 (월초 ~ 여유 일수)
    const startObj = parseIsoDateLocal(addCalendarDays(minDate, -7));
    startObj.setDate(1); // 월 1일부터 깔끔하게 시작
    const startStr = `${startObj.getFullYear()}-${String(startObj.getMonth() + 1).padStart(2, '0')}-01`;

    const endStr = addCalendarDays(maxDate, scale === 'month' ? 90 : 30);
    const daysCount = Math.max(60, Math.min(730, diffCalendarDays(startStr, endStr) + 1));

    const list: Array<{
      dateStr: string;
      year: number;
      month: number;
      day: number;
      weekday: number;
      isWeekend: boolean;
      holidayName: string | null;
      isToday: boolean;
    }> = [];

    for (let i = 0; i < daysCount; i++) {
      const dStr = addCalendarDays(startStr, i);
      const dObj = parseIsoDateLocal(dStr);
      list.push({
        dateStr: dStr,
        year: dObj.getFullYear(),
        month: dObj.getMonth() + 1,
        day: dObj.getDate(),
        weekday: dObj.getDay(),
        isWeekend: isWeekendDate(dStr),
        holidayName: getHolidayName(dStr, customHolidays),
        isToday: dStr === todayStr,
      });
    }

    return {
      timelineStartStr: startStr,
      totalDays: daysCount,
      dateList: list,
    };
  }, [flattenedRows, todayStr, scale, customHolidays]);

  // 상단 1단 헤더: 연·월(Month) 그룹 계산
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; count: number }> = [];
    const monthNamesEn = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    for (const item of dateList) {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.count++;
      } else {
        groups.push({
          key,
          label: `${monthNamesEn[item.month - 1]} ${item.year} (${item.year}년 ${item.month}월)`,
          count: 1,
        });
      }
    }
    return groups;
  }, [dateList]);

  // 주별(Week) 뷰에서 2단 헤더에 표시할 주간 블록 계산
  const weekGroups = useMemo(() => {
    if (scale !== 'week') return [];
    const groups: Array<{ key: string; label: string; count: number; containsToday: boolean }> = [];
    let currentCount = 0;
    let chunkStart = dateList[0];
    let hasToday = false;

    dateList.forEach((item, idx) => {
      if (currentCount === 0) {
        chunkStart = item;
        hasToday = false;
      }
      currentCount++;
      if (item.isToday) hasToday = true;

      // 일요일(0)이거나 마지막 날이면 주간 그룹 마감
      if (item.weekday === 0 || idx === dateList.length - 1) {
        groups.push({
          key: chunkStart.dateStr,
          label: `${chunkStart.month}/${chunkStart.day}~${item.day}`,
          count: currentCount,
          containsToday: hasToday,
        });
        currentCount = 0;
      }
    });
    return groups;
  }, [dateList, scale]);

  // 오늘(Today) 위치로 타임라인 스크롤 이동
  const scrollToToday = useCallback(() => {
    const el = rightScrollRef.current;
    if (!el) return;
    const offsetDays = diffCalendarDays(timelineStartStr, todayStr);
    if (offsetDays < 0) return;
    const targetLeft = Math.max(0, offsetDays * dayWidth - el.clientWidth / 3);
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [timelineStartStr, todayStr, dayWidth]);

  // 최초 마운트 및 스케일 변경 시 오늘 날짜 근처로 자동 스크롤
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToToday();
    }, 60);
    return () => clearTimeout(timer);
  }, [scale, scrollToToday]);

  // 좌우 패널 세로 스크롤 동기화
  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingScrollRef.current === 'right') {
      syncingScrollRef.current = null;
      return;
    }
    if (rightScrollRef.current) {
      syncingScrollRef.current = 'left';
      rightScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleRightScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingScrollRef.current === 'left') {
      syncingScrollRef.current = null;
      return;
    }
    if (leftBodyRef.current) {
      syncingScrollRef.current = 'right';
      leftBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // 타임라인 바 마우스 드래그(이동 / 우측 끝 리사이즈) 전역 이벤트 처리
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.initialX;
      const deltaDays = Math.round(dx / dayWidth);
      setDragState((prev) => (prev && prev.deltaDays !== deltaDays ? { ...prev, deltaDays } : prev));
    };

    const handleMouseUp = () => {
      if (dragState.deltaDays !== 0) {
        if (dragState.mode === 'move') {
          const rawNewStart = addCalendarDays(dragState.origStartDate, dragState.deltaDays);
          const snappedStart = snapToWorkingDay(
            rawNewStart,
            dragState.useWorkingDays,
            customHolidays,
            dragState.deltaDays >= 0 ? 1 : -1
          );
          updateTaskSchedule(dragState.noteId, {
            startDate: snappedStart,
            durationDays: dragState.origDuration,
            useWorkingDays: dragState.useWorkingDays,
          });
        } else if (dragState.mode === 'resize-end') {
          const rawNewDue = addCalendarDays(dragState.origDueDate, dragState.deltaDays);
          const validDue =
            rawNewDue < dragState.origStartDate ? dragState.origStartDate : rawNewDue;
          const snappedDue = snapToWorkingDay(
            validDue,
            dragState.useWorkingDays,
            customHolidays,
            1
          );
          updateTaskSchedule(dragState.noteId, {
            startDate: dragState.origStartDate,
            dueDate: snappedDue,
            useWorkingDays: dragState.useWorkingDays,
          });
        }
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, dayWidth, customHolidays, updateTaskSchedule]);

  const toggleRowCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openTaskDetail = useCallback(
    (noteId: string) => {
      select(noteId);
      setEditorDrawerOpened(true);
    },
    [select]
  );

  const handleOpenCreateModal = (parentId: string | null = null) => {
    setNewTitle('');
    setNewParentId(parentId);
    setNewStatus('todo');
    setNewStartDate(snapToWorkingDay(todayStr, true, customHolidays, 1));
    setNewDuration(2);
    setNewUseWorkingDays(true);
    if (parentId) {
      const parentNote = notes.find((n) => n.id === parentId);
      setNewColor(parentNote?.color || 'orange');
    } else {
      setNewColor('orange');
    }
    setCreateModalOpened(true);
  };

  const handleCreateSubmit = () => {
    if (!newTitle.trim()) return;
    createPlannerTask({
      title: newTitle.trim(),
      parentId: newParentId,
      status: newStatus,
      startDate: newStartDate,
      durationDays: newDuration,
      useWorkingDays: newUseWorkingDays,
      color: newColor,
    });
    if (newParentId) {
      setCollapsedIds((prev) => {
        if (!prev.has(newParentId)) return prev;
        const next = new Set(prev);
        next.delete(newParentId);
        return next;
      });
    }
    setCreateModalOpened(false);
  };

  const todayOffsetDays = diffCalendarDays(timelineStartStr, todayStr);

  // 각 노트의 행 인덱스 및 종료 오프셋 맵 (간트 차트 부모-자식 연결선 렌더링용)
  const rowPositionMap = useMemo(() => {
    const map = new Map<
      string,
      { rowIndex: number; startOffset: number; endOffset: number }
    >();
    flattenedRows.forEach((r, idx) => {
      const sOff = Math.max(0, diffCalendarDays(timelineStartStr, r.schedule.startDate));
      const eOff = Math.max(sOff + 1, diffCalendarDays(timelineStartStr, r.schedule.dueDate) + 1);
      map.set(r.note.id, { rowIndex: idx, startOffset: sOff, endOffset: eOff });
    });
    return map;
  }, [flattenedRows, timelineStartStr]);

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bn-surface-editor)',
      }}
    >
      {/* 1. 상단 플래너 컨트롤 & 요약 툴바 */}
      <Group
        justify="space-between"
        px="md"
        py={8}
        wrap="wrap"
        gap="xs"
        style={{
          borderBottom: '1px solid var(--bn-border-subtle)',
          backgroundColor: 'var(--bn-surface-list)',
          flexShrink: 0,
        }}
      >
        <Group gap="xs" wrap="wrap">
          <Tooltip label={tableCollapsed ? '좌측 작업 목록 펼치기' : '좌측 작업 목록 접기 (타임라인 전체 보기)'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={() => setTableCollapsed((v) => !v)}
              aria-label="작업 테이블 토글"
            >
              {tableCollapsed ? (
                <IconLayoutSidebarLeftExpand size={17} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={17} />
              )}
            </ActionIcon>
          </Tooltip>

          <Group gap={6} wrap="nowrap">
            <IconCalendarStats size={18} color="var(--mantine-color-orange-6)" />
            <Text fw={800} size="sm" style={{ letterSpacing: '-0.3px' }}>
              플래너 (Gantt Schedule)
            </Text>
          </Group>

          {/* 상태별 퀵 필터 뱃지 */}
          <Group gap={4} ml={4}>
            <Badge
              size="sm"
              variant={statusFilter === 'all' ? 'filled' : 'light'}
              color="dark"
              style={{ cursor: 'pointer' }}
              onClick={() => setStatusFilter('all')}
            >
              전체 {stats.total}
            </Badge>
            <Badge
              size="sm"
              variant={statusFilter === 'active' ? 'filled' : 'light'}
              color="blue"
              style={{ cursor: 'pointer' }}
              onClick={() => setStatusFilter('active')}
            >
              진행·대기 {stats.todo + stats.doing}
            </Badge>
            {stats.urgent > 0 && (
              <Badge
                size="sm"
                variant={statusFilter === 'urgent' ? 'filled' : 'light'}
                color="red"
                style={{ cursor: 'pointer' }}
                onClick={() => setStatusFilter('urgent')}
              >
                🔥 마감임박·지연 {stats.urgent}
              </Badge>
            )}
            <Badge
              size="sm"
              variant={statusFilter === 'done' ? 'filled' : 'light'}
              color="teal"
              style={{ cursor: 'pointer' }}
              onClick={() => setStatusFilter('done')}
            >
              완료 {stats.done}
            </Badge>
          </Group>
        </Group>

        {/* 우측: 일별/주별/월별 스케일 전환 + 오늘 이동 + 근무일/공휴일 설정 + 새 일정 추가 */}
        <Group gap={8} wrap="wrap">
          <SegmentedControl
            size="xs"
            value={scale}
            onChange={(val) => setScale(val as PlannerViewScale)}
            data={[
              { label: '일별 (Day)', value: 'day' },
              { label: '주별 (Week)', value: 'week' },
              { label: '월별 (Month)', value: 'month' },
            ]}
          />

          <Tooltip label="오늘 날짜 위치로 타임라인 스크롤 이동">
            <Button
              size="compact-xs"
              variant="light"
              color="gray"
              leftSection={<IconCalendarEvent size={13} />}
              onClick={scrollToToday}
            >
              오늘(Today)
            </Button>
          </Tooltip>

          {/* 근무일(Working Day) 및 주말/공휴일 제외 관리 팝오버 */}
          <Popover
            opened={holidayPopoverOpened}
            onChange={setHolidayPopoverOpened}
            position="bottom-end"
            withArrow
            shadow="md"
            width={340}
          >
            <Popover.Target>
              <Tooltip label="주말·대한민국 공휴일 자동 제외 규칙 및 사용자 휴무일 설정">
                <Button
                  size="compact-xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconCalendar size={13} />}
                  onClick={() => setHolidayPopoverOpened((v) => !v)}
                >
                  근무일/휴일 설정
                  {customHolidays.length > 0 ? ` (${customHolidays.length})` : ''}
                </Button>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="xs" fw={700}>
                    🗓️ Working Day (주말·공휴일 제외) 설정
                  </Text>
                  <Badge size="xs" color="teal" variant="light">
                    한국 공휴일 내장
                  </Badge>
                </Group>
                <Text size="11px" c="dimmed" style={{ lineHeight: 1.45 }}>
                  • 각 작업의 <strong>Working Day(평일)</strong> 옵션이 켜져 있으면 토/일요일과 대한민국 법정공휴일(설날·추석·대체공휴일 등)을 자동으로 건너뛰어 <strong>Due Date</strong>를 산출합니다.
                  <br />• <strong>Due Date</strong>가 지정·변경되면 해당 날짜 <strong>오전 09:00</strong>으로 알림 및 Google 캘린더 일정이 자동 등록됩니다.
                </Text>

                <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--bn-card-hover)' }}>
                  <Text size="xs" fw={600} mb={6}>
                    + 사용자 지정 휴무일(연차·창립기념일 등) 추가
                  </Text>
                  <Group gap={6} align="flex-end" wrap="nowrap">
                    <input
                      type="date"
                      value={holidayDateInput}
                      onChange={(e) => setHolidayDateInput(e.currentTarget.value)}
                      style={{
                        fontSize: 11.5,
                        padding: '4px 6px',
                        borderRadius: 6,
                        border: '1px solid var(--bn-border-subtle)',
                        backgroundColor: 'var(--mantine-color-body)',
                        color: 'var(--mantine-color-text)',
                      }}
                    />
                    <TextInput
                      size="xs"
                      placeholder="휴일명 (예: 하계휴가)"
                      value={holidayNameInput}
                      onChange={(e) => setHolidayNameInput(e.currentTarget.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="compact-xs"
                      color="teal"
                      onClick={() => {
                        if (!holidayDateInput) return;
                        addCustomHoliday(holidayDateInput, holidayNameInput || '휴무일');
                        setHolidayNameInput('');
                      }}
                    >
                      추가
                    </Button>
                  </Group>
                </Paper>

                {customHolidays.length > 0 && (
                  <Stack gap={4} mah={150} style={{ overflowY: 'auto' }}>
                    <Text size="11px" fw={600} c="dimmed">
                      등록된 사용자 휴무일 ({customHolidays.length}일)
                    </Text>
                    {customHolidays.map((h) => (
                      <Group
                        key={h.date}
                        justify="space-between"
                        px={8}
                        py={3}
                        style={{
                          borderRadius: 6,
                          backgroundColor: 'var(--bn-card-hover)',
                        }}
                      >
                        <Group gap={6}>
                          <Badge size="xs" color="red" variant="light">
                            {h.date}
                          </Badge>
                          <Text size="xs">{h.name}</Text>
                        </Group>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => removeCustomHoliday(h.date)}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Popover.Dropdown>
          </Popover>

          <Button
            size="compact-xs"
            variant="filled"
            color="orange"
            leftSection={<IconPlus size={13} />}
            onClick={() => handleOpenCreateModal(null)}
          >
            새 일정 추가
          </Button>
        </Group>
      </Group>

      {/* 2. 메인 간트 차트 영역: [좌측 작업 테이블] + [우측 간트 타임라인] */}
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {/* 좌측: 계층형 Task Name / Start Date / Duration (Working Days) / Due Date (09:00 알림) 테이블 */}
        {!tableCollapsed && (
          <Box
            style={{
              width: isMobile ? 260 : 590,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: '2px solid var(--bn-border-subtle)',
              backgroundColor: 'var(--bn-surface-list)',
              zIndex: 5,
            }}
          >
            {/* 좌측 테이블 헤더 (높이 HEADER_HEIGHT = 58px, 컬럼 타이틀 클릭/터치 시 오름·내림차순 정렬) */}
            <Box
              style={{
                height: HEADER_HEIGHT,
                flexShrink: 0,
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr 86px'
                : 'minmax(200px, 1fr) 118px 82px 164px',
                alignItems: 'center',
            padding: '0 10px',
            borderBottom: '1px solid var(--bn-border-subtle)',
            backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
            fontWeight: 700,
            fontSize: 12,
            color: 'var(--mantine-color-dimmed)',
            userSelect: 'none',
              }}
            >
            <Tooltip label="클릭/터치하여 작업명(Task Name) 기준 오름차순·내림차순 정렬" openDelay={300}>
              <Group
                gap={4}
                wrap="nowrap"
                onClick={() => handleHeaderSortClick('title')}
                style={{
                  cursor: 'pointer',
                  color: sortField === 'title' ? 'var(--mantine-color-blue-6)' : undefined,
                }}
              >
                <span>Task Name (작업명)</span>
                {sortField === 'title' ? (
                  sortOrder === 'asc' ? (
                    <IconArrowUp size={13} />
                  ) : (
                    <IconArrowDown size={13} />
                  )
                ) : (
                  <IconArrowsSort size={12} style={{ opacity: 0.45 }} />
                )}
              </Group>
            </Tooltip>

            {!isMobile && (
              <Tooltip label="클릭/터치하여 시작일(Start Date) 기준 오름차순·내림차순 정렬" openDelay={300}>
                <Group
                  gap={3}
                  justify="center"
                  wrap="nowrap"
                  onClick={() => handleHeaderSortClick('startDate')}
                  style={{
                    cursor: 'pointer',
                    color: sortField === 'startDate' ? 'var(--mantine-color-blue-6)' : undefined,
                  }}
                >
                  <span>Start Date</span>
                  {sortField === 'startDate' ? (
                    sortOrder === 'asc' ? (
                      <IconArrowUp size={13} />
                    ) : (
                      <IconArrowDown size={13} />
                    )
                  ) : (
                    <IconArrowsSort size={12} style={{ opacity: 0.45 }} />
                  )}
                </Group>
              </Tooltip>
            )}

            {!isMobile && (
              <Tooltip label="클릭/터치하여 소요일(Duration) 기준 오름차순·내림차순 정렬" openDelay={300}>
                <Group
                  gap={3}
                  justify="center"
                  wrap="nowrap"
                  onClick={() => handleHeaderSortClick('duration')}
                  style={{
                    cursor: 'pointer',
                    color: sortField === 'duration' ? 'var(--mantine-color-blue-6)' : undefined,
                  }}
                >
                  <span>Duration</span>
                  {sortField === 'duration' ? (
                    sortOrder === 'asc' ? (
                      <IconArrowUp size={13} />
                    ) : (
                      <IconArrowDown size={13} />
                    )
                  ) : (
                    <IconArrowsSort size={12} style={{ opacity: 0.45 }} />
                  )}
                </Group>
              </Tooltip>
            )}

            <Tooltip label="클릭/터치하여 마감일(Due Date) 기준 오름차순·내림차순 정렬" openDelay={300}>
              <Group
                gap={3}
                justify="center"
                wrap="nowrap"
                onClick={() => handleHeaderSortClick('dueDate')}
                style={{
                  cursor: 'pointer',
                  color: sortField === 'dueDate' ? 'var(--mantine-color-blue-6)' : undefined,
                }}
              >
                <span>{isMobile ? 'Due Date' : 'Due Date · 09시'}</span>
                {sortField === 'dueDate' ? (
                  sortOrder === 'asc' ? (
                    <IconArrowUp size={13} />
                  ) : (
                    <IconArrowDown size={13} />
                  )
                ) : (
                  <IconArrowsSort size={12} style={{ opacity: 0.45 }} />
                )}
              </Group>
            </Tooltip>
          </Box>

            {/* 좌측 테이블 본문 행 목록 */}
        <Box
          ref={leftBodyRef}
          onScroll={handleLeftScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {flattenedRows.length === 0 ? (
            <Stack align="center" justify="center" h={260} gap="xs" p="md">
              <Text size="sm" c="dimmed">
                표시할 일정 작업이 없습니다.
              </Text>
              <Button
                size="xs"
                variant="light"
                color="orange"
                leftSection={<IconPlus size={14} />}
                onClick={() => handleOpenCreateModal(null)}
              >
                첫 일정 작업 만들기
              </Button>
            </Stack>
          ) : (
            flattenedRows.map((row) => {
              const { note: n, depth, hasChildren, isCollapsed, schedule } = row;
              const isSelected = n.id === selectedId;
              const isDone = schedule.status === 'done';
              const dueBadge = getDueDateBadgeInfo(schedule.dueDate, schedule.status);
              const hasMorningAlarm = Boolean(n.reminder && !n.reminder.dismissed);
              const colorCfg = getPastelConfig(n.color || 'orange');

              return (
                <Box
                  key={n.id}
                  style={{
                    height: ROW_HEIGHT,
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? '1fr 86px'
                      : 'minmax(200px, 1fr) 118px 82px 164px',
                    alignItems: 'center',
          padding: '0 8px',
          borderBottom: '1px solid var(--bn-border-subtle)',
          backgroundColor: isSelected
          ? isDark
          ? 'rgba(51, 154, 240, 0.14)'
          : 'rgba(231, 245, 255, 0.7)'
          : hasChildren
          ? isDark
          ? 'rgba(255, 255, 255, 0.025)'
          : 'rgba(0, 0, 0, 0.018)'
          : 'transparent',
          transition: 'background-color 0.12s ease',
                      }}
                    >
          {/* 컬럼 1: 계층형 Task Name + 체크박스 + 하위 추가 + 상세 열기 */}
          <Group
            gap={4}
            wrap="nowrap"
            style={{
              paddingLeft: depth * 16,
              minWidth: 0,
              overflow: 'hidden',
              paddingRight: 4,
            }}
          >
            {hasChildren ? (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => toggleRowCollapse(n.id)}
                style={{ flexShrink: 0 }}
              >
                {isCollapsed ? (
                  <IconChevronRight size={13} />
                ) : (
                  <IconChevronDown size={13} />
                )}
              </ActionIcon>
            ) : (
              <span style={{ width: 18, flexShrink: 0 }} />
            )}

            <Checkbox
              size="xs"
              color="teal"
              checked={isDone}
              onChange={(e) =>
                changeTodoStatus(n.id, e.currentTarget.checked ? 'done' : 'todo')
              }
              styles={{ input: { cursor: 'pointer' } }}
            />

            {/* 색상 도트 */}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: colorCfg.border,
                flexShrink: 0,
              }}
            />

            {editingTitleId === n.id ? (
              <TextInput
                size="xs"
                value={editingTitleVal}
                onChange={(e) => setEditingTitleVal(e.currentTarget.value)}
                onBlur={() => {
                  if (editingTitleVal.trim()) {
                    updateTitle(n.id, editingTitleVal.trim());
                  }
                  setEditingTitleId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingTitleVal.trim()) {
                      updateTitle(n.id, editingTitleVal.trim());
                    }
                    setEditingTitleId(null);
                  } else if (e.key === 'Escape') {
                    setEditingTitleId(null);
                  }
                }}
                autoFocus
                style={{ flex: 1, minWidth: 0 }}
              />
            ) : (
              <Tooltip
                label={`${n.title || '제목 없음'} (클릭: 노트 상세 편집 / 더블클릭: 제목 수정)`}
                openDelay={400}
              >
                <Text
                  size="xs"
                  fw={hasChildren ? 700 : 500}
                  truncate
                  onClick={() => openTaskDetail(n.id)}
                  onDoubleClick={() => {
                    setEditingTitleId(n.id);
                    setEditingTitleVal(n.title);
                  }}
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    minWidth: 0,
                    textDecoration: isDone ? 'line-through' : undefined,
                    opacity: isDone ? 0.65 : 1,
                  }}
                >
                  {n.title || '제목 없음'}
                </Text>
              </Tooltip>
            )}

            {/* 행 빠른 액션: 하위 일정 추가 & 컨텍스트 메뉴 */}
            <Group gap={1} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Tooltip label="하위 일정(Sub-task) 추가">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => handleOpenCreateModal(n.id)}
                >
                  <IconPlus size={12} />
                </ActionIcon>
              </Tooltip>

              <Menu position="bottom-end" withArrow shadow="md" withinPortal>
                <Menu.Target>
                  <ActionIcon size="xs" variant="subtle" color="gray">
                    <IconDots size={12} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconEdit size={13} />}
                    onClick={() => openTaskDetail(n.id)}
                  >
                    노트 본문 상세 편집
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconPlus size={13} />}
                    onClick={() => handleOpenCreateModal(n.id)}
                  >
                    하위 일정 추가
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Label>상태 변경</Menu.Label>
                  {TODO_GROUPS.map((g) => (
                    <Menu.Item
                      key={g.status}
                      onClick={() => changeTodoStatus(n.id, g.status)}
                      rightSection={
                        schedule.status === g.status ? <IconCheck size={12} /> : null
                      }
                    >
                      {g.title}
                    </Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Label>계층 및 색상</Menu.Label>
                  <Menu.Item
                    leftSection={<IconIndentIncrease size={13} />}
                    disabled={!row.prevSibling}
                    onClick={() => indent(n.id)}
                  >
                    들여쓰기 (하위 작업으로)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconIndentDecrease size={13} />}
                    disabled={!row.hasParent}
                    onClick={() => outdent(n.id)}
                  >
                    내어쓰기 (상위 레벨로)
                  </Menu.Item>
                  <Menu.Item leftSection={<IconPalette size={13} />}>
                    <Group gap={4}>
                      {['orange', 'blue', 'purple', 'mint', 'pink', 'yellow', 'teal'].map(
                        (cid) => (
                          <span
                            key={cid}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateColor(n.id, cid);
                            }}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              backgroundColor: PASTEL_COLORS[cid]?.border || '#339af0',
                              cursor: 'pointer',
                              border:
                                n.color === cid
                                  ? '2px solid var(--mantine-color-text)'
                                  : '1px solid rgba(0,0,0,0.15)',
                            }}
                          />
                        )
                      )}
                    </Group>
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={13} />}
                    onClick={() => {
                      if (window.confirm(`"${n.title}" 일정을 삭제할까요?`)) {
                        remove(n.id);
                      }
                    }}
                  >
                    일정 삭제
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>

          {/* 컬럼 2: Start Date (데스크톱/태블릿) */}
          {!isMobile && (
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <Tooltip
                label={
                  schedule.isRollup
                    ? '하위 일정 기준 자동 시작일 (클릭하여 직접 변경 가능)'
                    : '시작일 변경 (소요일 기준 Due Date 자동 재계산)'
                }
              >
                <input
                  type="date"
                  value={schedule.startDate}
                  onChange={(e) => {
                    if (!e.currentTarget.value) return;
                    updateTaskSchedule(n.id, {
                      startDate: e.currentTarget.value,
                    });
                  }}
                  style={{
                    width: 108,
                    fontSize: 11.5,
                    padding: '2px 4px',
                    borderRadius: 5,
                    border: '1px solid var(--bn-border-subtle)',
                    backgroundColor: schedule.isRollup
                      ? 'transparent'
                      : 'var(--mantine-color-body)',
                    color: 'var(--mantine-color-text)',
                    fontWeight: schedule.isRollup ? 600 : 400,
                    cursor: 'pointer',
                  }}
                />
              </Tooltip>
            </Box>
          )}

          {/* 컬럼 3: Duration (소요일 숫자 입력) */}
          {!isMobile && (
            <Group justify="center" wrap="nowrap">
              <NumberInput
                size="xs"
                min={1}
                max={365}
                value={schedule.durationDays}
                onChange={(val) => {
                  const num = Number(val);
                  if (!Number.isFinite(num) || num < 1) return;
                  updateTaskSchedule(n.id, { durationDays: num });
                }}
                styles={{
                  root: { width: 58 },
                  input: {
                    textAlign: 'center',
                    paddingLeft: 4,
                    paddingRight: 18,
                    fontSize: 12,
                    fontWeight: 600,
                    height: 26,
                    minHeight: 26,
                  },
                }}
              />
            </Group>
          )}

              {/* 컬럼 4: Due Date (마감일 직접 선택 + D-Day + 오전 09:00 자동 알림 표시) */}
              <Group gap={4} justify="center" wrap="nowrap">
                {!isMobile && (
                  <Tooltip label="마감일(Due Date) 선택 시 해당 날짜 오전 09:00 알림이 자동 등록됩니다">
                    <input
                      type="date"
                      value={schedule.dueDate}
                      onChange={(e) => {
                        if (!e.currentTarget.value) return;
                        updateTaskSchedule(n.id, {
                          dueDate: e.currentTarget.value,
                        });
                      }}
                      style={{
                        width: 106,
                        fontSize: 11.5,
                        padding: '2px 4px',
                        borderRadius: 5,
                        border: dueBadge?.isOverdue
                          ? '1px solid var(--mantine-color-red-5)'
                          : '1px solid var(--bn-border-subtle)',
                        backgroundColor: 'var(--mantine-color-body)',
                        color: dueBadge?.isOverdue
                          ? 'var(--mantine-color-red-6)'
                          : 'var(--mantine-color-text)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    />
                  </Tooltip>
                )}

                {dueBadge && (
                  <Tooltip
                    label={`Due Date: ${schedule.dueDate} · ${hasMorningAlarm
                        ? '⏰ 당일 오전 09:00 알림 예약됨 (Google 캘린더 연동)'
                        : '클릭하여 오전 09:00 알림 활성화'
                      }`}
                  >
                    <Badge
                      size="xs"
                      color={dueBadge.color}
                      variant={dueBadge.isOverdue ? 'filled' : 'light'}
                      style={{ cursor: 'pointer', flexShrink: 0, padding: '0 5px' }}
                      onClick={() =>
                        updateTaskSchedule(
                          n.id,
                          { dueDate: schedule.dueDate },
                          { autoReminder: true }
                        )
                      }
                    >
                      {hasMorningAlarm && (
                        <IconBellRinging
                          size={9}
                          style={{ marginRight: 2, verticalAlign: 'middle' }}
                        />
                      )}
                      {dueBadge.label}
                    </Badge>
                  </Tooltip>
                )}
              </Group>
            </Box>
          );
                })
              )}
        </Box>
      </Box>
        )}

      {/* 우측: 간트 차트 타임라인 (일별 / 주별 / 월별 그리드 + 드래그 가능한 캡슐형 바) */}
      <Box
        ref={rightScrollRef}
        onScroll={handleRightScroll}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          backgroundColor: 'var(--bn-surface-editor)',
          userSelect: dragState ? 'none' : undefined,
        }}
      >
        <Box
          style={{
            width: totalDays * dayWidth,
            minHeight: '100%',
            position: 'relative',
          }}
        >
          {/* 타임라인 상단 고정 2단 헤더 (Month 헤더 + Day/Week/Month 눈금) */}
          <Box
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              height: HEADER_HEIGHT,
              backgroundColor: 'var(--bn-surface-list)',
              borderBottom: '1px solid var(--bn-border-subtle)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* 1단: 연·월(Oct 2025 / Jan 2026 스타일) 헤더 */}
            <Box
              style={{
                height: 28,
                display: 'flex',
                borderBottom: '1px solid var(--bn-border-subtle)',
              }}
            >
              {monthGroups.map((mg) => (
                <Box
                  key={mg.key}
                  style={{
                    width: mg.count * dayWidth,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: '1px solid var(--bn-border-subtle)',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '-0.2px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mg.label}
                </Box>
              ))}
            </Box>

            {/* 2단: 스케일별 일자(Day) / 주간(Week) / 월간(Month) 눈금 헤더 */}
            <Box style={{ height: 30, display: 'flex' }}>
              {scale === 'day' &&
                dateList.map((d) => {
                  const isRedDay = d.weekday === 0 || Boolean(d.holidayName);
                  const isSat = d.weekday === 6 && !d.holidayName;
                  return (
                    <Tooltip
                      key={d.dateStr}
                      label={`${d.dateStr}${d.holidayName ? ` · 🎌 ${d.holidayName} (휴일 제외)` : d.isWeekend ? ' · 주말 (휴일 제외)' : ' · 평일 (근무일)'}`}
                      openDelay={250}
                    >
                      <Box
                        style={{
                          width: dayWidth,
                          flexShrink: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: '1px solid var(--bn-border-subtle)',
                          backgroundColor: d.isToday
                            ? 'var(--mantine-color-blue-6)'
                            : isRedDay
                              ? isDark
                                ? 'rgba(250, 82, 82, 0.14)'
                                : 'rgba(255, 235, 235, 0.75)'
                              : isSat
                                ? isDark
                                  ? 'rgba(51, 154, 240, 0.12)'
                                  : 'rgba(231, 245, 255, 0.65)'
                                : 'transparent',
                          color: d.isToday
                            ? '#ffffff'
                            : isRedDay
                              ? 'var(--mantine-color-red-6)'
                              : isSat
                                ? 'var(--mantine-color-blue-6)'
                                : 'var(--mantine-color-dimmed)',
                          fontWeight: d.isToday || isRedDay ? 700 : 500,
                          fontSize: 11.5,
                        }}
                      >
                        <span>{d.day}</span>
                      </Box>
                    </Tooltip>
                  );
                })}

              {scale === 'week' &&
                weekGroups.map((wg) => (
                  <Box
                    key={wg.key}
                    style={{
                      width: wg.count * dayWidth,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRight: '1px solid var(--bn-border-subtle)',
                      backgroundColor: wg.containsToday
                        ? isDark
                          ? 'rgba(51, 154, 240, 0.16)'
                          : 'rgba(231, 245, 255, 0.8)'
                        : 'transparent',
                      color: wg.containsToday
                        ? 'var(--mantine-color-blue-6)'
                        : 'var(--mantine-color-dimmed)',
                      fontSize: 11,
                      fontWeight: wg.containsToday ? 700 : 600,
                    }}
                  >
                    {wg.label}
                  </Box>
                ))}

              {scale === 'month' &&
                monthGroups.map((mg) => (
                  <Box
                    key={`sub-${mg.key}`}
                    style={{
                      width: mg.count * dayWidth,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      borderRight: '1px solid var(--bn-border-subtle)',
                      fontSize: 10,
                      color: 'var(--mantine-color-dimmed)',
                    }}
                  >
                    <span>1주</span>
                    <span>2주</span>
                    <span>3주</span>
                    <span>4주</span>
                  </Box>
                ))}
            </Box>
          </Box>

          {/* 타임라인 배경 세로 그리드 및 주말/공휴일 음영 + 간트 바 레이어 */}
          <Box
            style={{
              position: 'relative',
              minHeight: Math.max(flattenedRows.length * ROW_HEIGHT, 320),
            }}
          >
            {/* 배경 세로 컬럼 레이어 (주말·공휴일 시각적 음영 구분) */}
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                pointerEvents: 'none',
              }}
            >
              {dateList.map((d) => {
                const isHoliday = Boolean(d.holidayName);
                const isNonWork = d.isWeekend || isHoliday;
                return (
                  <Box
                    key={`bg-${d.dateStr}`}
                    style={{
                      width: dayWidth,
                      flexShrink: 0,
                      height: '100%',
                      borderRight:
                        scale === 'month' && d.day !== 1 && d.weekday !== 0
                          ? 'none'
                          : '1px solid var(--bn-border-subtle)',
                      backgroundColor: isHoliday
                        ? isDark
                          ? 'rgba(250, 82, 82, 0.08)'
                          : 'rgba(255, 227, 227, 0.38)'
                        : d.isWeekend
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.025)'
                            : 'rgba(0, 0, 0, 0.025)'
                          : 'transparent',
                      backgroundImage:
                        isNonWork && scale === 'day'
                          ? isDark
                            ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.018) 5px, rgba(255,255,255,0.018) 10px)'
                            : 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.015) 5px, rgba(0,0,0,0.015) 10px)'
                          : undefined,
                    }}
                  />
                );
              })}
            </Box>

            {/* 오늘(Today) 세로 기준선 */}
            {todayOffsetDays >= 0 && todayOffsetDays < totalDays && (
              <Box
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: todayOffsetDays * dayWidth + dayWidth / 2,
                  width: 2,
                  backgroundColor: 'var(--mantine-color-red-6)',
                  zIndex: 6,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* 부모-자식 간트 바 연결 화살표 (첨부 이미지 스타일 L자 커넥터 SVG) */}
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: Math.max(flattenedRows.length * ROW_HEIGHT, 320),
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              {flattenedRows.map((row) => {
                const parentId = row.note.parentId;
                if (!parentId) return null;
                const parentPos = rowPositionMap.get(parentId);
                const childPos = rowPositionMap.get(row.note.id);
                if (!parentPos || !childPos) return null;

                const x1 = Math.max(8, parentPos.startOffset * dayWidth + 14);
                const y1 = parentPos.rowIndex * ROW_HEIGHT + ROW_HEIGHT - 8;
                const x2 = childPos.startOffset * dayWidth;
                const y2 = childPos.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                const strokeColor = isDark ? 'rgba(180, 190, 210, 0.35)' : 'rgba(130, 142, 160, 0.45)';
                return (
                  <g key={`edge-${parentId}-${row.note.id}`}>
                    <path
                      d={`M ${x1} ${y1} L ${x1} ${y2} L ${Math.max(x1, x2 - 4)} ${y2}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                    />
                    {x2 > x1 && (
                      <polygon
                        points={`${x2 - 2},${y2} ${x2 - 7},${y2 - 3.5} ${x2 - 7},${y2 + 3.5}`}
                        fill={strokeColor}
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* 행별 가로 가이드라인 및 간트 캡슐 바 렌더링 */}
            {flattenedRows.map((row) => {
              const { note: n, schedule } = row;
              const isDraggingThis = dragState?.noteId === n.id;

              // 드래그 중일 때 실시간 미리보기 위치 계산
              let displayStart = schedule.startDate;
              let displayDue = schedule.dueDate;
              if (isDraggingThis && dragState) {
                if (dragState.mode === 'move') {
                  displayStart = addCalendarDays(dragState.origStartDate, dragState.deltaDays);
                  displayDue = addCalendarDays(dragState.origDueDate, dragState.deltaDays);
                } else if (dragState.mode === 'resize-end') {
                  const candidate = addCalendarDays(dragState.origDueDate, dragState.deltaDays);
                  displayDue = candidate < displayStart ? displayStart : candidate;
                }
              }

              const startOffsetDays = diffCalendarDays(timelineStartStr, displayStart);
              const spanDays = Math.max(1, diffCalendarDays(displayStart, displayDue) + 1);
              const leftPx = startOffsetDays * dayWidth + 2;
              const widthPx = Math.max(dayWidth - 4, spanDays * dayWidth - 4);

              const colorCfg = getPastelConfig(
                n.color ||
                (schedule.status === 'done'
                  ? 'mint'
                  : schedule.status === 'doing'
                    ? 'orange'
                    : 'peach')
              );
              const isSelected = n.id === selectedId;
              const initialChar = (n.title || 'T').trim().charAt(0).toUpperCase();

              return (
                <Box
                  key={`bar-row-${n.id}`}
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: '1px solid var(--bn-border-subtle)',
                    position: 'relative',
                    backgroundColor: isSelected
                      ? isDark
                        ? 'rgba(51, 154, 240, 0.08)'
                        : 'rgba(231, 245, 255, 0.35)'
                      : 'transparent',
                  }}
                >
                  <Tooltip
                    label={`${n.title} · ${displayStart} ~ ${displayDue} (실작업 ${schedule.durationDays
                      }일${schedule.useWorkingDays &&
                        schedule.weekendCount + schedule.holidays.length > 0
                        ? `, 주말/공휴일 ${schedule.weekendCount + schedule.holidays.length
                        }일 제외됨`
                        : ''
                      }) · Due Date 09:00 알림`}
                    openDelay={300}
                    disabled={Boolean(dragState)}
                  >
                    <Box
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        setDragState({
                          noteId: n.id,
                          mode: 'move',
                          initialX: e.clientX,
                          origStartDate: schedule.startDate,
                          origDueDate: schedule.dueDate,
                          origDuration: schedule.durationDays,
                          useWorkingDays: schedule.useWorkingDays,
                          deltaDays: 0,
                        });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (dragState && dragState.deltaDays !== 0) return;
                        openTaskDetail(n.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: 8,
                        height: 30,
                        left: leftPx,
                        width: widthPx,
                        borderRadius: 999,
                        backgroundColor: colorCfg.bg,
                        border: `1.5px solid ${colorCfg.border}`,
                        boxShadow: isDraggingThis
                          ? '0 6px 16px rgba(0,0,0,0.22)'
                          : '0 2px 5px rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 8px 0 4px',
                        cursor: isDraggingThis ? 'grabbing' : 'grab',
                        overflow: 'visible',
                        zIndex: isDraggingThis ? 15 : 4,
                        transition: isDraggingThis ? 'none' : 'left 0.12s ease, width 0.12s ease',
                      }}
                    >
                      {/* 진행률(Progress) 채우기 오버레이 */}
                      {schedule.progress > 0 && (
                        <Box
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: `${Math.min(100, schedule.progress)}%`,
                            borderRadius: 999,
                            backgroundColor: colorCfg.border,
                            opacity: 0.22,
                            pointerEvents: 'none',
                          }}
                        />
                      )}

                      {/* 좌측 아바타 뱃지 + 바 내부 작업명 (첨부 이미지 스타일) */}
                      <Group
                        gap={6}
                        wrap="nowrap"
                        style={{
                          minWidth: 0,
                          flex: 1,
                          overflow: 'hidden',
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        <Box
                          style={{
                            width: 21,
                            height: 21,
                            borderRadius: '50%',
                            backgroundColor: colorCfg.border,
                            color: '#ffffff',
                            fontSize: 10.5,
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {schedule.status === 'done' ? '✓' : initialChar}
                        </Box>
                        <Text
                          size="xs"
                          fw={700}
                          truncate
                          style={{
                            color: colorCfg.textColor,
                            fontSize: 11.5,
                            letterSpacing: '-0.2px',
                          }}
                        >
                          {n.title || '제목 없음'}
                        </Text>
                      </Group>

                      {/* 바 우측 실작업일수 뱃지 */}
                      {widthPx >= 90 && (
                        <Badge
                          size="xs"
                          variant="filled"
                          style={{
                            backgroundColor: colorCfg.badgeBg,
                            color: colorCfg.textColor,
                            flexShrink: 0,
                            marginLeft: 4,
                            position: 'relative',
                            zIndex: 2,
                          }}
                        >
                          {schedule.durationDays}d
                        </Badge>
                      )}

                      {/* 우측 끝 기간(Due Date) 조절 드래그 핸들 (첨부 이미지의 우측 원형 핸들 스타일) */}
                      <Tooltip label="우측 끝을 드래그하여 마감일(Due Date) 및 작업일수 조절">
                        <Box
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              noteId: n.id,
                              mode: 'resize-end',
                              initialX: e.clientX,
                              origStartDate: schedule.startDate,
                              origDueDate: schedule.dueDate,
                              origDuration: schedule.durationDays,
                              useWorkingDays: schedule.useWorkingDays,
                              deltaDays: 0,
                            });
                          }}
                          style={{
                            position: 'absolute',
                            right: -11,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            backgroundColor: 'var(--mantine-color-body)',
                            border: `2px solid ${colorCfg.border}`,
                            cursor: 'ew-resize',
                            zIndex: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              backgroundColor: colorCfg.border,
                            }}
                          />
                        </Box>
                      </Tooltip>
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>

      {/* 3. 우측 슬라이드 노트 상세 에디터 드로어 (작업 클릭 시 본문 편집) */ }
  <Drawer
    opened={editorDrawerOpened}
    onClose={() => setEditorDrawerOpened(false)}
    position="right"
    size={isMobile ? '100%' : '54%'}
    padding={0}
    withCloseButton={false}
    styles={{
      body: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bn-surface-editor)',
      },
    }}
  >
    <Group
      justify="space-between"
      px="md"
      py={8}
      style={{
        borderBottom: '1px solid var(--bn-border-subtle)',
        backgroundColor: 'var(--bn-surface-titlebar)',
      }}
    >
      <Group gap={6}>
        <Badge size="xs" color="orange" variant="light">
          플래너 작업 상세 노트
        </Badge>
        <Text size="xs" c="dimmed">
          본문 내용, 체크리스트, 첨부파일 및 세부 알림을 편집할 수 있습니다
        </Text>
      </Group>
      <Button
        size="compact-xs"
        variant="light"
        color="gray"
        onClick={() => setEditorDrawerOpened(false)}
      >
        닫기 (간트 차트로 돌아가기)
      </Button>
    </Group>
    <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <NoteEditorView onBackToList={() => setEditorDrawerOpened(false)} isCompact={isMobile} />
    </Box>
  </Drawer>

  {/* 4. 새 일정 작업 생성 모달 */ }
  <Modal
    opened={createModalOpened}
    onClose={() => setCreateModalOpened(false)}
    title={
      <Group gap={6}>
        <IconCalendarStats size={18} color="var(--mantine-color-orange-6)" />
        <Text fw={700} size="sm">
          {newParentId ? '하위 일정(Sub-task) 추가' : '새 플래너 일정 추가'}
        </Text>
      </Group>
    }
    size="sm"
    centered
  >
    <Stack gap="sm">
      <TextInput
        label="작업명 (Task Name)"
        placeholder="예: Research & Planning, UI 설계 및 검토"
        value={newTitle}
        onChange={(e) => setNewTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateSubmit();
        }}
        data-autofocus
      />

      <Group grow align="flex-start">
        <div>
          <Text size="xs" fw={600} mb={4}>
            시작일 (Start Date)
          </Text>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.currentTarget.value)}
            style={{
              width: '100%',
              fontSize: 12.5,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--bn-border-subtle)',
              backgroundColor: 'var(--mantine-color-body)',
              color: 'var(--mantine-color-text)',
            }}
          />
        </div>

        <NumberInput
          label="소요일 (Duration)"
          size="xs"
          min={1}
          max={365}
          value={newDuration}
          onChange={(val) => setNewDuration(Math.max(1, Number(val) || 1))}
          suffix=" 일"
        />
      </Group>

      <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: 'var(--bn-card-hover)' }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <div>
            <Text size="xs" fw={600}>
              주말·공휴일 제외 (Working Day 기준)
            </Text>
            <Text size="11px" c="dimmed">
              체크 시 토/일요일 및 공휴일을 건너뛰어 Due Date를 계산하고 당일 09:00 알림을 자동 등록합니다.
            </Text>
          </div>
          <Switch
            size="sm"
            color="teal"
            checked={newUseWorkingDays}
            onChange={(e) => setNewUseWorkingDays(e.currentTarget.checked)}
          />
        </Group>
      </Paper>

      <Group grow>
        <Select
          label="진행 상태"
          size="xs"
          value={newStatus}
          onChange={(v) => setNewStatus((v as TodoStatus) || 'todo')}
          data={[
            { value: 'todo', label: '📥 To Do (대기)' },
            { value: 'doing', label: '⏳ Doing (진행 중)' },
            { value: 'done', label: '✅ Done (완료)' },
          ]}
        />
        <div>
          <Text size="xs" fw={600} mb={6}>
            간트 바 색상
          </Text>
          <Group gap={6}>
            {['orange', 'peach', 'blue', 'purple', 'mint', 'pink', 'yellow'].map((cid) => (
              <ActionIcon
                key={cid}
                size="sm"
                radius="xl"
                onClick={() => setNewColor(cid)}
                style={{
                  backgroundColor: PASTEL_COLORS[cid]?.bg,
                  border: `2px solid ${PASTEL_COLORS[cid]?.border}`,
                  transform: newColor === cid ? 'scale(1.2)' : 'none',
                }}
              />
            ))}
          </Group>
        </div>
      </Group>

      <Group justify="flex-end" mt="xs">
        <Button size="xs" variant="subtle" color="gray" onClick={() => setCreateModalOpened(false)}>
          취소
        </Button>
        <Button size="xs" color="orange" onClick={handleCreateSubmit}>
          일정 등록 (Due Date 09:00 알림 포함)
        </Button>
      </Group>
    </Stack>
  </Modal>
    </Box >
  );
}

