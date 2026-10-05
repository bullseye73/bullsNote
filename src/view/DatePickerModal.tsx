// VIEW: 인터랙티브 날짜/시간 선택 팝업 (달력 모달)
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconCalendar,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DateFormatStyle,
  formatDateIso,
  formatFormattedDate,
  formatTime,
  getNextMonday,
  getRelativeDays,
  getRelativeMonths,
  getToday,
  getTomorrow,
  getYesterday,
  pad2,
} from '../model/dateUtils';

interface DatePickerModalProps {
  opened: boolean;
  onClose: () => void;
  onInsert: (formattedDate: string) => void;
  initialDate?: Date;
}

const STORAGE_KEY_FORMAT = 'bullsnote_date_format';

export function DatePickerModal({
  opened,
  onClose,
  onInsert,
  initialDate,
}: DatePickerModalProps) {
  const [dateStr, setDateStr] = useState<string>(() => formatDateIso(initialDate || new Date()));
  const [includeTime, setIncludeTime] = useState(false);
  const [timeStr, setTimeStr] = useState<string>(() => formatTime(initialDate || new Date()));
  const [formatStyle, setFormatStyle] = useState<DateFormatStyle>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FORMAT);
    if (saved && ['iso', 'iso-weekday', 'korean', 'korean-weekday'].includes(saved)) {
      return saved as DateFormatStyle;
    }
    return 'iso-weekday';
  });

  // 모달이 열릴 때마다 기본 상태 동기화
  useEffect(() => {
    if (opened) {
      const now = initialDate || new Date();
      setDateStr(formatDateIso(now));
      setTimeStr(formatTime(now));
    }
  }, [opened, initialDate]);

  // 파싱된 Date 객체
  const parsedDate = useMemo(() => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const res = new Date(y, m, d);
      if (!isNaN(res.getTime())) return res;
    }
    return new Date();
  }, [dateStr]);

  // 실시간 미리보기 텍스트
  const previewText = useMemo(() => {
    return formatFormattedDate(parsedDate, formatStyle, includeTime, timeStr);
  }, [parsedDate, formatStyle, includeTime, timeStr]);

  const handleSelectPreset = (d: Date) => {
    setDateStr(formatDateIso(d));
  };

  const handleInsert = () => {
    localStorage.setItem(STORAGE_KEY_FORMAT, formatStyle);
    onInsert(previewText);
    onClose();
  };

  // 다음 주 금요일 계산
  const getThisFriday = () => {
    const d = getToday();
    const currentDay = d.getDay();
    let diff = 5 - currentDay;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8}>
          <IconCalendarEvent size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={700} size="md">
            날짜 및 시간 삽입
          </Text>
        </Group>
      }
      centered
      size="md"
      overlayProps={{ opacity: 0.45, blur: 2 }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleInsert();
        }
      }}
    >
      <Stack gap="sm">
        {/* 1. 빠른 프리셋 칩 */}
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            빠른 날짜 선택 (프리셋)
          </Text>
          <Group gap={6} wrap="wrap">
            <Button
              size="compact-xs"
              variant={dateStr === formatDateIso(getToday()) ? 'filled' : 'light'}
              color="blue"
              onClick={() => handleSelectPreset(getToday())}
            >
              오늘
            </Button>
            <Button
              size="compact-xs"
              variant={dateStr === formatDateIso(getTomorrow()) ? 'filled' : 'light'}
              color="cyan"
              onClick={() => handleSelectPreset(getTomorrow())}
            >
              내일
            </Button>
            <Button
              size="compact-xs"
              variant={dateStr === formatDateIso(getYesterday()) ? 'filled' : 'light'}
              color="gray"
              onClick={() => handleSelectPreset(getYesterday())}
            >
              어제
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="indigo"
              onClick={() => handleSelectPreset(getThisFriday())}
            >
              이번 주 금요일
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="grape"
              onClick={() => handleSelectPreset(getNextMonday())}
            >
              다음 주 월요일
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="teal"
              onClick={() => handleSelectPreset(getRelativeDays(7))}
            >
              +7일 뒤
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="orange"
              onClick={() => handleSelectPreset(getRelativeMonths(1))}
            >
              +1개월 뒤
            </Button>
          </Group>
        </div>

        {/* 2. 달력 및 시간 인풋 */}
        <Group grow align="flex-end">
          <TextInput
            label="날짜 선택"
            description="원하는 날짜를 선택하거나 달력 아이콘을 클릭하세요"
            type="date"
            leftSection={<IconCalendar size={16} />}
            value={dateStr}
            onChange={(e) => setDateStr(e.currentTarget.value)}
            required
          />
          {includeTime && (
            <TextInput
              label="시간 선택"
              description="시:분 (24시간)"
              type="time"
              leftSection={<IconClock size={16} />}
              value={timeStr}
              onChange={(e) => setTimeStr(e.currentTarget.value)}
              w={140}
              style={{ flexGrow: 0 }}
            />
          )}
        </Group>

        <Checkbox
          label="시간 정보 포함 (HH:mm)"
          checked={includeTime}
          onChange={(e) => setIncludeTime(e.currentTarget.checked)}
          size="xs"
        />

        {/* 3. 출력 서식 선택 */}
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            표시 서식 선택
          </Text>
          <Radio.Group
            value={formatStyle}
            onChange={(val) => setFormatStyle(val as DateFormatStyle)}
          >
            <Stack gap={6}>
              <Radio
                value="iso-weekday"
                label={
                  <Group gap={6}>
                    <Text size="xs" fw={600}>
                      {formatFormattedDate(parsedDate, 'iso-weekday', includeTime, timeStr)}
                    </Text>
                    <Badge size="xs" variant="light" color="blue">
                      추천 (요일 포함)
                    </Badge>
                  </Group>
                }
              />
              <Radio
                value="iso"
                label={
                  <Text size="xs">
                    {formatFormattedDate(parsedDate, 'iso', includeTime, timeStr)} (ISO 표준)
                  </Text>
                }
              />
              <Radio
                value="korean-weekday"
                label={
                  <Text size="xs">
                    {formatFormattedDate(parsedDate, 'korean-weekday', includeTime, timeStr)} (한국어 요일)
                  </Text>
                }
              />
              <Radio
                value="korean"
                label={
                  <Text size="xs">
                    {formatFormattedDate(parsedDate, 'korean', includeTime, timeStr)} (한국어 서식)
                  </Text>
                }
              />
            </Stack>
          </Radio.Group>
        </div>

        {/* 4. 최종 미리보기 카드 */}
        <Card withBorder p="xs" radius="md" style={{ background: 'var(--mantine-color-default-hover)' }}>
          <Group justify="space-between" align="center">
            <div>
              <Text size="xs" c="dimmed">
                삽입될 텍스트 미리보기:
              </Text>
              <Text fw={700} size="sm" c="blue" mt={2}>
                {previewText}
              </Text>
            </div>
            <Badge size="xs" variant="outline" color="gray">
              커서 위치에 삽입
            </Badge>
          </Group>
        </Card>

        {/* 5. 액션 버튼 */}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" size="xs" leftSection={<IconX size={14} />} onClick={onClose}>
            취소 (Esc)
          </Button>
          <Button
            variant="filled"
            color="blue"
            size="xs"
            leftSection={<IconCheck size={14} />}
            onClick={handleInsert}
          >
            에디터에 삽입 (Enter)
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
