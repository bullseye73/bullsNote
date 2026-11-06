// MODEL: Google Calendar REST API 연동 서비스 (노트/할일 알람 -> 모바일 푸시 알림 동기화)
import { Note, NoteReminder, NoteReminderRepeat } from './Note';
import { GoogleDriveService } from './GoogleDriveService';
import { noteBodyText } from './HashtagService';
import { TODO_PROJECT_ID } from './TodoService';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** 반복 설정(NoteReminderRepeat)을 RFC 5545 RRULE 배열로 변환 */
function toRecurrenceRules(repeat: NoteReminderRepeat): string[] {
  switch (repeat) {
    case 'daily':
      return ['RRULE:FREQ=DAILY'];
    case 'weekdays':
      return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'];
    case 'weekly':
      return ['RRULE:FREQ=WEEKLY'];
    case 'monthly':
      return ['RRULE:FREQ=MONTHLY'];
    case 'none':
    default:
      return [];
  }
}

/** 노트/할일 상태에 따른 Google Calendar 일정 제목 생성 */
function buildCalendarSummary(note: Note): string {
  const title = (note.title || '').trim() || '제목 없음';
  if (note.projectId === TODO_PROJECT_ID) {
    if (note.todoMeta?.status === 'done') {
      return `✅ [완료] ${title}`;
    }
    return `📋 [할일] ${title}`;
  }
  return `🔔 [노트] ${title}`;
}

/** 노트 본문 및 메타데이터를 Google Calendar 일정 설명으로 변환 */
function buildCalendarDescription(note: Note): string {
  const body = noteBodyText(note.content).trim();
  const lines: string[] = [];

  if (body) {
    lines.push(body.slice(0, 2000));
    lines.push('');
  }

  if (note.tags && note.tags.length > 0) {
    lines.push(`태그: ${note.tags.map((t) => `#${t}`).join(' ')}`);
  }

  if (note.projectId === TODO_PROJECT_ID) {
    const statusLabel =
      note.todoMeta?.status === 'done'
        ? 'Done (완료)'
        : note.todoMeta?.status === 'doing'
          ? 'Doing (진행 중)'
          : 'To Do (할 일)';
    lines.push(`할일 상태: ${statusLabel}`);
  }

  lines.push('— BullsNote 알람 연동');
  return lines.join('\n');
}

/** Google Calendar API 오류를 사용자 친화적인 한글 안내 메시지로 변환 */
function formatCalendarApiError(status: number, rawText: string, context: string): string {
  try {
    const parsed = JSON.parse(rawText);
    const errObj = parsed?.error;
    const message: string = errObj?.message || rawText;
    const details: any[] = Array.isArray(errObj?.details) ? errObj.details : [];
    const errors: any[] = Array.isArray(errObj?.errors) ? errObj.errors : [];

    const isServiceDisabled =
      message.includes('Google Calendar API has not been used') ||
      message.includes('calendar-json.googleapis.com') ||
      message.includes('it is disabled') ||
      details.some((d) => d?.reason === 'SERVICE_DISABLED') ||
      errors.some((e) => e?.reason === 'accessNotConfigured');

    if (isServiceDisabled) {
      const urlMatch = message.match(
        /https:\/\/console\.developers\.google\.com\/apis\/api\/calendar-json\.googleapis\.com\/overview\?project=[0-9]+/,
      );
      const enableUrl =
        urlMatch?.[0] || 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com';
      return `Google Cloud 프로젝트에서 'Google Calendar API'를 활성화해주세요: ${enableUrl}`;
    }

    const isInsufficientScope =
      status === 403 ||
      message.includes('insufficient authentication scopes') ||
      details.some((d) => d?.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      errors.some((e) => e?.reason === 'insufficientPermissions');

    if (isInsufficientScope) {
      return 'Google 캘린더 권한이 필요합니다. 좌측 하단 [Google Drive 동기화 설정]에서 [연동 해제] 후 다시 로그인하여 캘린더 권한을 허용해주세요.';
    }

    if (status === 401) {
      return 'Google 인증 토큰이 만료되었습니다. Google 계정을 다시 연동해주세요.';
    }

    return `${context} (${status}): ${message}`;
  } catch {
    return `${context} (${status}): ${rawText}`;
  }
}

class GoogleCalendarServiceImpl {
  /** 인증 헤더 포함 fetch (401 만료 시 1회 자동 토큰 갱신 재시도) */
  private async fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    let token = await GoogleDriveService.getValidAccessToken(false);
    if (!token) {
      throw new Error('Google 계정이 연동되어 있지 않거나 인증 토큰이 만료되었습니다.');
    }

    const makeRequest = (accessToken: string) => {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${accessToken}`);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(url, { ...init, headers });
    };

    let res = await makeRequest(token);
    if (res.status === 401) {
      const refreshed = await GoogleDriveService.getValidAccessToken(true);
      if (refreshed) {
        res = await makeRequest(refreshed);
      }
    }
    return res;
  }

  /**
   * 노트 또는 할일의 알람(NoteReminder)을 Google Calendar 일정으로 생성 또는 업데이트합니다.
   * - 모바일 푸시 알림: 10분 전(popup, 10) + 정각(popup, 0) 2회 알림
   * - 할일 Done 완료 상태 또는 1회성 알람 확인(dismissed) 상태일 때는 푸시 알림 해제(overrides: [])
   */
  async upsertReminderEvent(
    note: Note,
    reminder: NoteReminder,
  ): Promise<{ eventId?: string; htmlLink?: string; error?: string }> {
    if (!GoogleDriveService.isConnected()) {
      return { error: 'Google 계정이 연동되어 있지 않습니다.' };
    }

    try {
      const effectiveStartMs = reminder.snoozedUntil || reminder.targetAt;
      const endMs = effectiveStartMs + 30 * 60 * 1000; // 30분 블록 일정
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

      const isTodoDone = note.projectId === TODO_PROJECT_ID && note.todoMeta?.status === 'done';
      const isOneOffDismissed = reminder.dismissed && reminder.repeat === 'none';
      const disableNotifications = isTodoDone || isOneOffDismissed;

      const recurrence = toRecurrenceRules(reminder.repeat);

      const payload: Record<string, unknown> = {
        summary: buildCalendarSummary(note),
        description: buildCalendarDescription(note),
        start: {
          dateTime: new Date(effectiveStartMs).toISOString(),
          timeZone,
        },
        end: {
          dateTime: new Date(endMs).toISOString(),
          timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: disableNotifications
            ? []
            : [
                { method: 'popup', minutes: 0 },
                { method: 'popup', minutes: 10 },
              ],
        },
      };

      if (recurrence.length > 0) {
        payload.recurrence = recurrence;
      } else {
        payload.recurrence = [];
      }

      let res: Response | null = null;

      // 기존 연동된 calendarEventId가 있으면 PUT 업데이트 시도 (404/410 시 신규 POST로 폴백)
      if (reminder.calendarEventId) {
        const updateUrl = `${CALENDAR_API_BASE}/${encodeURIComponent(reminder.calendarEventId)}`;
        res = await this.fetchWithAuth(updateUrl, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        if (res.status === 404 || res.status === 410) {
          res = null;
        }
      }

      if (!res) {
        res = await this.fetchWithAuth(CALENDAR_API_BASE, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errText = await res.text();
        return {
          error: formatCalendarApiError(res.status, errText, 'Google 캘린더 일정 저장 실패'),
        };
      }

      const data = (await res.json()) as { id?: string; htmlLink?: string };
      return {
        eventId: data.id,
        htmlLink: data.htmlLink,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 연동된 Google Calendar 일정을 삭제합니다. */
  async deleteReminderEvent(calendarEventId: string): Promise<{ success: boolean; error?: string }> {
    if (!calendarEventId || !GoogleDriveService.isConnected()) {
      return { success: true };
    }

    try {
      const deleteUrl = `${CALENDAR_API_BASE}/${encodeURIComponent(calendarEventId)}`;
      const res = await this.fetchWithAuth(deleteUrl, {
        method: 'DELETE',
      });

      // 204 No Content, 200 OK, 혹은 이미 삭제된 404/410은 모두 성공 처리
      if (res.ok || res.status === 404 || res.status === 410) {
        return { success: true };
      }

      const errText = await res.text();
      return {
        success: false,
        error: formatCalendarApiError(res.status, errText, 'Google 캘린더 일정 삭제 실패'),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const GoogleCalendarService = new GoogleCalendarServiceImpl();
