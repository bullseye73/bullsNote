// VIEW: 에러 경계 - 렌더 예외 시 빈 화면 대신 복구 UI 표시
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, ReactNode } from 'react';

interface Props {
  title: string;
  onResetNote?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Stack gap="xs" p="md">
        <Alert icon={<IconAlertTriangle size={16} />} title={this.props.title} color="red">
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {error.message}
          </Text>
        </Alert>
        <Group gap="xs">
          {this.props.onResetNote && (
            <Button size="xs" variant="light" onClick={() => { this.setState({ error: null }); this.props.onResetNote!(); }}>
              이 노트 안전하게 초기화
            </Button>
          )}
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={() => {
              if (confirm('저장된 모든 노트를 삭제하고 초기 상태로 되돌릴까요? (JSON 내보내기로 백업 권장)')) {
                localStorage.removeItem('bullsnote.notes.v1');
                location.reload();
              }
            }}
          >
            전체 데이터 초기화
          </Button>
        </Group>
      </Stack>
    );
  }
}
