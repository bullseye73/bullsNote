import { ActionIcon, CopyButton, Group, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconEye, IconEyeOff } from '@tabler/icons-react';
import React, { useState } from 'react';

export function SecretInput({
  label,
  description,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  description?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [pinnedReveal, setPinnedReveal] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const visible = pinnedReveal || hovered || focused || !value;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <TextInput
        label={label}
        description={description}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        rightSectionWidth={64}
        rightSection={
          <Group gap={2} wrap="nowrap">
            <Tooltip label={pinnedReveal ? '항상 숨기기' : '항상 표시 고정 (마우스 오버 시 자동 표시)'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color={pinnedReveal ? 'blue' : 'gray'}
                onClick={() => setPinnedReveal((v) => !v)}
                aria-label="표시 전환"
              >
                {visible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </ActionIcon>
            </Tooltip>
            <CopyButton value={value} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? '복사됨!' : '클립보드에 복사'}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    disabled={!value}
                    onClick={copy}
                    aria-label="복사"
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        }
        styles={{
          input: {
            fontFamily: visible ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
            fontSize: 12.5,
          },
        }}
      />
    </div>
  );
}
