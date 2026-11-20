// MODEL: BlockNote / 슬래시 메뉴에 Mermaid 다이어그램 블록 삽입 명령어 등록
import React from 'react';
import type { BlockNoteEditor } from '@blocknote/core';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import { IconSitemap } from '@tabler/icons-react';
import { buildMermaidSlashSpecs } from './mermaidService';

type AnyEditor = BlockNoteEditor<any, any, any>;

export function getMermaidSlashMenuItems(editor: AnyEditor): DefaultReactSuggestionItem[] {
  return buildMermaidSlashSpecs().map((spec) => ({
    title: spec.title,
    subtext: spec.subtext,
    badge: spec.badge,
    aliases: spec.aliases,
    group: spec.group,
    icon: <IconSitemap size={18} color="var(--mantine-color-cyan-5)" />,
    onItemClick: () => {
      const currentBlock = editor.getTextCursorPosition()?.block;
      const isCurrentEmpty =
        currentBlock &&
        currentBlock.type === 'paragraph' &&
        (!Array.isArray(currentBlock.content) ||
          currentBlock.content.length === 0 ||
          currentBlock.content.every((c: any) => !c.text));

      const payload = {
        type: 'codeBlock',
        props: { language: spec.language },
        content: [{ type: 'text', text: spec.defaultCode, styles: {} }],
      } as never;

      if (isCurrentEmpty) {
        editor.updateBlock(currentBlock, payload);
      } else if (currentBlock) {
        editor.insertBlocks([payload], currentBlock, 'after');
      } else {
        const last = editor.document[editor.document.length - 1];
        if (last) {
          editor.insertBlocks([payload], last, 'after');
        }
      }

      requestAnimationFrame(() => {
        try {
          editor.focus();
        } catch {}
      });
    },
  }));
}
