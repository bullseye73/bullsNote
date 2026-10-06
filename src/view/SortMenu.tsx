// VIEW: 프로젝트 및 노트 정렬 on/off 드롭다운 메뉴 컴포넌트
import { ActionIcon, Badge, Group, Menu, Tooltip } from '@mantine/core';
import {
  IconArrowsSort,
  IconArrowUp,
  IconArrowDown,
  IconCheck,
  IconClock,
  IconCalendarEvent,
  IconLetterCase,
  IconBan,
} from '@tabler/icons-react';
import { SortField, SortOption } from '../model/Note';

interface SortMenuProps {
  sortOption: SortOption;
  onChange: (opt: SortOption) => void;
  targetName?: string;
  size?: 'xs' | 'sm';
}

export function SortMenu({
  sortOption,
  onChange,
  targetName = '목록',
  size = 'xs',
}: SortMenuProps) {
  const isSorted = sortOption.field !== 'none';

  const handleSelectField = (field: SortField) => {
    if (field === 'none') {
      onChange({ field: 'none', order: 'desc' });
      return;
    }

    if (sortOption.field === field) {
      // 이미 선택된 필드면 오름차순/내림차순 토글
      onChange({
        field,
        order: sortOption.order === 'asc' ? 'desc' : 'asc',
      });
    } else {
      // 새로 선택된 필드: 이름은 기본 asc(가나다), 날짜는 기본 desc(최신순)
      const defaultOrder = field === 'name' ? 'asc' : 'desc';
      onChange({ field, order: defaultOrder });
    }
  };

  const getSortLabel = () => {
    if (!isSorted) return `${targetName} 정렬 (기본 순서 - 클릭하여 정렬 설정)`;
    const fieldName =
      sortOption.field === 'name'
        ? '이름순'
        : sortOption.field === 'createdAt'
        ? '생성일순'
        : '업데이트일순';
    const orderName =
      sortOption.field === 'name'
        ? sortOption.order === 'asc'
          ? '가나다'
          : '역순'
        : sortOption.order === 'desc'
        ? '최신순'
        : '오래된순';
    return `${targetName} 정렬 중: ${fieldName} (${orderName}) - 클릭하여 변경`;
  };

  return (
    <Menu position="bottom-end" shadow="md" width={205} withArrow withinPortal>
      <Menu.Target>
        <Tooltip label={getSortLabel()}>
          <ActionIcon
            size={size}
            variant={isSorted ? 'filled' : 'subtle'}
            color={isSorted ? 'blue' : 'gray'}
            aria-label={`${targetName} 정렬 옵션`}
            style={{
              transition: 'all 0.15s ease',
            }}
          >
            <IconArrowsSort size={size === 'xs' ? 13 : 15} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{targetName} 정렬 설정</Menu.Label>

        {/* 정렬 끄기 / 기본 순서 */}
        <Menu.Item
          leftSection={<IconBan size={14} />}
          rightSection={sortOption.field === 'none' ? <IconCheck size={14} color="#228be6" /> : null}
          onClick={() => handleSelectField('none')}
          color={sortOption.field === 'none' ? 'blue' : undefined}
          fw={sortOption.field === 'none' ? 600 : 400}
        >
          기본 순서 (정렬 끄기)
        </Menu.Item>

        <Menu.Divider />

        {/* 이름순 */}
        <Menu.Item
          leftSection={<IconLetterCase size={14} />}
          rightSection={
            sortOption.field === 'name' ? (
              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light" color="blue">
                  {sortOption.order === 'asc' ? '가나다' : '역순'}
                </Badge>
                {sortOption.order === 'asc' ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
              </Group>
            ) : null
          }
          onClick={() => handleSelectField('name')}
          color={sortOption.field === 'name' ? 'blue' : undefined}
          fw={sortOption.field === 'name' ? 600 : 400}
        >
          이름순
        </Menu.Item>

        {/* 생성일순 */}
        <Menu.Item
          leftSection={<IconCalendarEvent size={14} />}
          rightSection={
            sortOption.field === 'createdAt' ? (
              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light" color="blue">
                  {sortOption.order === 'desc' ? '최신순' : '오래된순'}
                </Badge>
                {sortOption.order === 'desc' ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />}
              </Group>
            ) : null
          }
          onClick={() => handleSelectField('createdAt')}
          color={sortOption.field === 'createdAt' ? 'blue' : undefined}
          fw={sortOption.field === 'createdAt' ? 600 : 400}
        >
          생성일순
        </Menu.Item>

        {/* 업데이트일순 */}
        <Menu.Item
          leftSection={<IconClock size={14} />}
          rightSection={
            sortOption.field === 'updatedAt' ? (
              <Group gap={4} wrap="nowrap">
                <Badge size="xs" variant="light" color="blue">
                  {sortOption.order === 'desc' ? '최신순' : '오래된순'}
                </Badge>
                {sortOption.order === 'desc' ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />}
              </Group>
            ) : null
          }
          onClick={() => handleSelectField('updatedAt')}
          color={sortOption.field === 'updatedAt' ? 'blue' : undefined}
          fw={sortOption.field === 'updatedAt' ? 600 : 400}
        >
          업데이트일순
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
