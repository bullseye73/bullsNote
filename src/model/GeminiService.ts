/**
 * GeminiService: Google Gemini REST API 호출 및 설정 관리
 * external dependency 없이 native fetch를 사용하여 가볍고 안정적으로 동작합니다.
 */

export interface GeminiConfig {
  apiKey: string;
  model: string;
  systemInstruction?: string;
}

export interface GeminiModelInfo {
  id: string;
  name: string;
  description?: string;
}

export type AiActionType =
  | 'summarize'
  | 'format'
  | 'grammar'
  | 'action_items'
  | 'translate_en'
  | 'translate_ko'
  | 'continue'
  | 'custom';

export interface AiActionMeta {
  type: AiActionType;
  label: string;
  description: string;
  icon: string;
  defaultPlacement: 'top' | 'bottom' | 'replace';
}

export const AI_ACTIONS_META: AiActionMeta[] = [
  { type: 'summarize', label: '핵심 3줄 요약', description: '노트의 핵심 내용을 3개 항목으로 요약합니다', icon: '📝', defaultPlacement: 'top' },
  { type: 'format', label: '서식 정리 및 구조화', description: '두서없는 메모를 헤딩과 불릿으로 깔끔하게 정돈합니다', icon: '🧹', defaultPlacement: 'replace' },
  { type: 'grammar', label: '맞춤법 및 문맥 교정', description: '오탈자와 띄어쓰기를 교정하고 문장을 다듬습니다', icon: '✍️', defaultPlacement: 'replace' },
  { type: 'action_items', label: '할 일(Action Items) 추출', description: '본문에서 실행할 체크박스 목록을 자동 추출합니다', icon: '📋', defaultPlacement: 'bottom' },
  { type: 'continue', label: 'AI 이어 쓰기', description: '현재 문맥에 이어 자연스러운 다음 내용을 작성합니다', icon: '💡', defaultPlacement: 'bottom' },
  { type: 'translate_en', label: '영어로 번역', description: '현재 내용을 자연스러운 영어로 번역합니다', icon: '🌐', defaultPlacement: 'replace' },
  { type: 'translate_ko', label: '한국어로 번역', description: '외국어 내용을 한국어로 번역합니다', icon: '🇰🇷', defaultPlacement: 'replace' },
  { type: 'custom', label: '자유 요청', description: '원하는 지시사항을 직접 입력하여 처리합니다', icon: '✨', defaultPlacement: 'bottom' },
];

export const DEFAULT_GEMINI_MODELS: GeminiModelInfo[] = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (구글 추천 · 최신 & 초고속)', description: 'Google 공식 추천 차세대 최신 플래시 모델' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (경량 · 경제적)', description: '안정적인 범용 경량 모델' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (고성능 · 복잡한 추론)', description: '긴 문서 분석 및 깊이 있는 사고' },
];

const CONFIG_STORAGE_KEY = 'bullsnote_gemini_config';

const DEFAULT_CONFIG: GeminiConfig = {
  apiKey: '',
  model: 'gemini-3.8-flash',
  systemInstruction: '당신은 지식 정리 및 노트 필기 전문가입니다. 사용자의 요청에 대해 체계적이고 가독성이 뛰어난 한국어 마크다운(Markdown) 문서로 작성해주세요. 소제목(##), 글머리 기호(-), 중요 키워드 강조(**bold**), 코드 블록 또는 표를 적절히 활용하세요.',
};

export class GeminiService {
  /**
   * 모델명에 붙은 'models/' 접두사 등을 제거하여 안전한 ID 반환
   */
  static cleanModelId(model: string): string {
    const trimmed = (model || '').trim();
    if (trimmed.startsWith('models/')) {
      return trimmed.slice(7);
    }
    return trimmed || 'gemini-3.8-flash';
  }

  static getConfig(): GeminiConfig {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 구버전 gemini-2.0-flash가 저장되어 있었다면 자동으로 3.8-flash로 갱신
        let model = parsed.model;
        if (model === 'gemini-2.0-flash' || !model) {
          model = 'gemini-3.8-flash';
        }
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          model: this.cleanModelId(model),
        };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CONFIG;
  }

  static saveConfig(newConfig: Partial<GeminiConfig>): GeminiConfig {
    const current = this.getConfig();
    const updated: GeminiConfig = {
      ...current,
      ...newConfig,
      model: newConfig.model ? this.cleanModelId(newConfig.model) : current.model,
    };
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save Gemini config:', e);
    }
    return updated;
  }

  /**
   * 해당 API 키로 현재 실제 사용 가능한 Google Gemini 모델 목록을 실시간 조회
   */
  static async fetchAvailableModels(apiKey: string): Promise<GeminiModelInfo[]> {
    if (!apiKey.trim()) return [];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.models || !Array.isArray(data.models)) return [];

      // generateContent 메소드를 지원하는 Gemini 모델만 추출
      const validModels: GeminiModelInfo[] = data.models
        .filter((m: { supportedGenerationMethods?: string[]; name?: string }) => {
          return m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini');
        })
        .map((m: { name: string; displayName?: string; description?: string }) => {
          const id = this.cleanModelId(m.name);
          return {
            id,
            name: `${m.displayName || id} (${id})`,
            description: m.description,
          };
        });

      return validModels.length > 0 ? validModels : DEFAULT_GEMINI_MODELS;
    } catch (e) {
      console.warn('Failed to fetch available Gemini models:', e);
      return [];
    }
  }

  static async testConnection(apiKey: string, rawModel = 'gemini-3.8-flash'): Promise<{ ok: boolean; message: string }> {
    if (!apiKey.trim()) {
      return { ok: false, message: 'API 키를 입력해주세요.' };
    }
    const model = this.cleanModelId(rawModel);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello, respond with "OK"' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = (errJson as { error?: { message?: string } })?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        return { ok: false, message: `연결 실패: ${errMsg}` };
      }

      return { ok: true, message: `Google Gemini API 연결 성공! (${model} 모델 정상 동작)` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `네트워크 오류: ${msg}` };
    }
  }

  static async generateContent(prompt: string, configOverride?: Partial<GeminiConfig>): Promise<string> {
    const config = { ...this.getConfig(), ...configOverride };
    if (!config.apiKey.trim()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다. 설정 탭에서 API 키를 등록해주세요.');
    }

    const model = this.cleanModelId(config.model || 'gemini-3.8-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    };

    if (config.systemInstruction && config.systemInstruction.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: config.systemInstruction.trim() }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = (errJson as { error?: { message?: string } })?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      throw new Error(`Gemini API 오류: ${errMsg}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';

    if (!textPart) {
      throw new Error('Gemini로부터 유효한 텍스트 응답을 받지 못했습니다.');
    }

    return textPart;
  }

  /**
   * 마크다운 텍스트에서 제목과 본문을 똑똑하게 분리 추출
   */
  static extractTitleAndContent(rawText: string): { title: string; markdownBody: string } {
    const cleaned = rawText.trim();
    if (!cleaned) {
      return { title: 'Gemini AI 노트', markdownBody: '' };
    }

    const lines = cleaned.split('\n');
    let titleCandidate = '';
    let bodyStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 1) 마크다운 헤더 라인 (# 제목, ## 제목 등)
      const hMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (hMatch) {
        titleCandidate = hMatch[1].trim();
        bodyStartIndex = i + 1;
        break;
      }

      // 2) 첫 번째 의미 있는 일반 텍스트 라인
      titleCandidate = line;
      if (line.length < 80 && lines.length > i + 1) {
        bodyStartIndex = i + 1;
      } else {
        bodyStartIndex = 0;
      }
      break;
    }

    let title = titleCandidate
      .replace(/^[*_~`]+/, '')
      .replace(/[*_~`]+$/, '')
      .replace(/^\[.*?\]\s*/, '')
      .trim();

    if (title.length > 60) {
      title = title.slice(0, 57) + '...';
    }

    if (!title) {
      title = 'Gemini AI 노트';
    }

    const markdownBody = lines.slice(bodyStartIndex).join('\n').trim() || cleaned;

    return {
      title,
      markdownBody,
    };
  }

  /**
   * 에디터 내 특정 AI 액션(요약, 서식정리, 교정, 할일추출 등) 수행
   */
  static async transformContent(
    action: AiActionType,
    content: string,
    customInstruction?: string
  ): Promise<string> {
    if (!content.trim()) {
      throw new Error('처리할 노트 내용이 비어있습니다.');
    }

    let systemPrompt = '';
    let userPrompt = '';

    switch (action) {
      case 'summarize':
        systemPrompt = '당신은 최고의 문서 요약 전문가입니다. 본문의 핵심 사실과 결론을 정확하게 3개의 개조식 글머리 기호(- )로 요약해주세요. 서론이나 잡담 없이 마크다운 요약문만 깔끔하게 출력하세요.';
        userPrompt = `다음 문서를 3줄로 핵심 요약해주세요:\n\n${content}`;
        break;
      case 'format':
        systemPrompt = '당신은 테크니컬 라이팅 및 문서 서식 정리 전문가입니다. 원문의 모든 정보와 의미를 그대로 보존하되, 적절한 소제목(##), 글머리 기호(-), 중요 단어 강조(**bold**), 표 또는 코드 블록 등을 사용하여 가독성이 뛰어난 완벽한 마크다운 문서로 구조화해주세요. 잡담 없이 정돈된 마크다운 내용만 출력하세요.';
        userPrompt = `다음 내용을 깔끔한 마크다운 문서로 서식 정돈 및 구조화해주세요:\n\n${content}`;
        break;
      case 'grammar':
        systemPrompt = '당신은 전문 한국어 교정/교열가입니다. 맞춤법, 띄어쓰기, 어색한 문장 구조를 자연스럽고 품격 있는 비즈니스 문체로 교정해주세요. 원문의 의미를 훼손하지 말고 교정된 마크다운 본문만 출력하세요.';
        userPrompt = `다음 문서의 맞춤법과 문맥을 자연스럽고 깔끔하게 교정해주세요:\n\n${content}`;
        break;
      case 'action_items':
        systemPrompt = '당신은 프로젝트 매니저입니다. 본문이나 회의 내용 중 실행해야 할 작업, 결정 사항, 일정, 담당자를 파악하여 마크다운 체크박스(- [ ] 작업 내용) 목록으로 일목요연하게 추출해주세요. 잡담 없이 체크박스 목록만 출력하세요.';
        userPrompt = `다음 내용에서 실행해야 할 일(Action Items)을 체크박스 목록으로 추출해주세요:\n\n${content}`;
        break;
      case 'continue':
        systemPrompt = '당신은 지식 작성 보조 AI입니다. 사용자가 작성 중인 문서의 맥락, 어조, 주제를 완벽히 이해하고, 뒤이어 자연스럽게 이어질 수 있는 유익하고 논리적인 다음 내용을 작성해주세요. 기존 본문을 반복하지 말고, 바로 이어지는 추가 내용만 마크다운으로 출력하세요.';
        userPrompt = `다음 문서의 뒤를 이어 자연스러운 내용을 추가 작성해주세요:\n\n${content}`;
        break;
      case 'translate_en':
        systemPrompt = '당신은 전문 번역가입니다. 원문의 뉘앙스를 살려 유창하고 격식 있는 현대 영어로 번역해주세요. 번역문만 마크다운으로 출력하세요.';
        userPrompt = `다음 텍스트를 영어로 번역해주세요:\n\n${content}`;
        break;
      case 'translate_ko':
        systemPrompt = '당신은 전문 번역가입니다. 원문의 맥락을 살려 자연스럽고 가독성 높은 한국어로 번역해주세요. 번역문만 마크다운으로 출력하세요.';
        userPrompt = `다음 텍스트를 한국어로 번역해주세요:\n\n${content}`;
        break;
      case 'custom':
        systemPrompt = '당신은 지식 정리 AI 전문가입니다. 사용자의 지시사항을 정확하게 수행하여 마크다운으로 출력하세요.';
        userPrompt = `[지시사항]: ${customInstruction || '내용을 정리해주세요'}\n\n[원본 내용]:\n${content}`;
        break;
    }

    return this.generateContent(userPrompt, { systemInstruction: systemPrompt });
  }
}
