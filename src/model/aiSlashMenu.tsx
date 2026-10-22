// MODEL: BlockNote / 슬래시 메뉴에 Gemini AI 어시스턴트 명령어 등록
import React from 'react';
import { DefaultReactSuggestionItem } from '@blocknote/react';
import type { BlockNoteEditor } from '@blocknote/core';
import {
  IconChecklist,
  IconLanguage,
  IconPencilCheck,
  IconSparkles,
  IconWand,
  IconWriting,
} from '@tabler/icons-react';
import { AI_ACTIONS_META, AiActionType } from './GeminiService';

type AnyEditor = BlockNoteEditor<any, any, any>;

/**
 * / 슬래시 메뉴에 표시할 Gemini AI 추천 명령어 목록
 */
export function getAiSlashMenuItems(
  editor: AnyEditor,
  onTriggerAi: (action: AiActionType) => void
): DefaultReactSuggestionItem[] {
  const getActionIcon = (type: AiActionType) => {
    switch (type) {
      case 'summarize':
        return <IconSparkles size={18} color="var(--mantine-color-violet-5)" />;
      case 'format':
        return <IconWand size={18} color="var(--mantine-color-indigo-5)" />;
      case 'grammar':
        return <IconPencilCheck size={18} color="var(--mantine-color-teal-5)" />;
      case 'action_items':
        return <IconChecklist size={18} color="var(--mantine-color-blue-5)" />;
      case 'continue':
        return <IconWriting size={18} color="var(--mantine-color-grape-5)" />;
      case 'translate_en':
      case 'translate_ko':
        return <IconLanguage size={18} color="var(--mantine-color-cyan-5)" />;
      default:
        return <IconSparkles size={18} color="var(--mantine-color-violet-5)" />;
    }
  };

  const getAliases = (type: AiActionType): string[] => {
    switch (type) {
      case 'summarize':
        return ['ai', 'gemini', '요약', 'summary', '3줄', '핵심'];
      case 'format':
        return ['ai', 'gemini', '정리', '서식', 'format', '구조화', '정돈'];
      case 'grammar':
        return ['ai', 'gemini', '교정', '맞춤법', 'grammar', '문법', '오탈자'];
      case 'action_items':
        return ['ai', 'gemini', '할일', 'todo', 'action', '체크리스트', 'actions'];
      case 'continue':
        return ['ai', 'gemini', '이어쓰기', '계속', 'continue', '작성'];
      case 'translate_en':
        return ['ai', 'gemini', '번역', '영어', 'translate', 'english'];
      case 'translate_ko':
        return ['ai', 'gemini', '번역', '한국어', 'translate', 'korean'];
      case 'custom':
        return ['ai', 'gemini', '프롬프트', '자유', '질문', 'ask'];
      default:
        return ['ai', 'gemini'];
    }
  };

  return AI_ACTIONS_META.map((meta) => ({
    title: `AI: ${meta.label}`,
    subtext: meta.description,
    badge: 'Gemini',
    aliases: getAliases(meta.type),
    group: 'Gemini AI 어시스턴트',
    icon: getActionIcon(meta.type),
    onItemClick: () => {
      onTriggerAi(meta.type);
    },
  }));
}
