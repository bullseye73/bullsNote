// VIEW: 종단간 암호화(E2EE) 보안 설정 및 마스터 비밀번호 잠금/해제 모달
import { useState, useEffect } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconKey,
  IconLock,
  IconLockOpen,
  IconShieldCheck,
  IconShieldLock,
} from '@tabler/icons-react';
import { useNotes } from '../controller/NotesController';
import { CryptoService } from '../model/CryptoService';

interface SecurityModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SecurityModal({ opened, onClose }: SecurityModalProps) {
  const {
    notes,
    isMasterSet,
    isUnlocked,
    setupMasterPassword,
    unlockMasterPassword,
    lockMasterPassword,
    removeMasterPassword,
  } = useNotes();

  // 탭 / 모드 상태: 'unlock' | 'setup' | 'manage' | 'change'
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'unlock' | 'setup' | 'manage' | 'change'>('unlock');

  useEffect(() => {
    if (opened) {
      setPassword('');
      setConfirmPassword('');
      setOldPassword('');
      setError(null);
      setSuccessMsg(null);
      const hasEncrypted = notes.some((n) => CryptoService.isEncrypted(n.content));
      if (!isMasterSet && !hasEncrypted) {
        setViewMode('setup');
      } else if (!isUnlocked) {
        setViewMode('unlock');
      } else {
        setViewMode('manage');
      }
    }
  }, [opened, isMasterSet, isUnlocked, notes]);

  // 마스터 비밀번호 최초 설정
  const handleSetup = async () => {
    setError(null);
    if (!password || password.length < 4) {
      setError('비밀번호는 최소 4자 이상 입력해주세요.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      await setupMasterPassword(password);
      setSuccessMsg('마스터 비밀번호가 설정되었습니다! 모든 노트가 안전하게 암호화되었습니다.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 설정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 잠금 해제
  const handleUnlock = async () => {
    setError(null);
    if (!password) {
      setError('마스터 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const ok = await unlockMasterPassword(password);
      if (ok) {
        setSuccessMsg('잠금이 해제되었습니다!');
        setTimeout(() => {
          onClose();
        }, 500);
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠금 해제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 지금 잠그기
  const handleLockNow = () => {
    lockMasterPassword();
    setViewMode('unlock');
    setPassword('');
    setSuccessMsg('앱이 안전하게 잠겼습니다.');
  };

  // 마스터 비밀번호 보호 해제
  const handleRemove = async () => {
    if (!window.confirm('암호화 보호를 해제하시겠습니까? 이제 노트가 평문으로 저장됩니다.')) {
      return;
    }
    setLoading(true);
    try {
      await removeMasterPassword();
      setSuccessMsg('마스터 비밀번호 보호가 해제되었습니다.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '보호 해제 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8}>
          <ThemeIcon color={isUnlocked ? 'teal' : isMasterSet ? 'orange' : 'blue'} variant="light">
            {isUnlocked ? <IconLockOpen size={18} /> : isMasterSet ? <IconLock size={18} /> : <IconShieldLock size={18} />}
          </ThemeIcon>
          <Text fw={700}>종단간 암호화(E2EE) 보안</Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" title="오류">
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert icon={<IconCheck size={16} />} color="teal" variant="light">
            {successMsg}
          </Alert>
        )}

        {/* 1. 마스터 비밀번호 미설정 -> 설정 모드 */}
        {viewMode === 'setup' && (
          <>
            <Alert color="blue" variant="light" icon={<IconShieldCheck size={16} />}>
              마스터 비밀번호를 설정하면 로컬 저장소와 Supabase DB에 저장되는 모든 노트 본문이 <strong>AES-GCM 256비트</strong>로 암호화됩니다.
              앱에서 비밀번호를 열기 전에는 누구도 내용을 확인할 수 없습니다.
            </Alert>
            <PasswordInput
              label="새 마스터 비밀번호"
              placeholder="최소 4자리 이상 입력"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="비밀번호 확인"
              placeholder="비밀번호 다시 입력"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSetup();
              }}
              required
            />
            <Text size="xs" c="dimmed">
              * 주의: 마스터 비밀번호는 서버에 전송되지 않으므로 분실 시 복구할 수 없습니다. 안전한 곳에 메모해두세요.
            </Text>
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={onClose}>
                취소
              </Button>
              <Button color="blue" onClick={handleSetup} loading={loading} leftSection={<IconKey size={16} />}>
                마스터 비밀번호 설정 및 전체 암호화
              </Button>
            </Group>
          </>
        )}

        {/* 2. 잠긴 상태 -> 잠금 해제 모드 */}
        {viewMode === 'unlock' && (
          <>
            <Alert color="orange" variant="light" icon={<IconLock size={16} />}>
              노트가 암호화되어 안전하게 잠겨 있습니다. 내용을 열람하고 편집하려면 마스터 비밀번호를 입력해주세요.
            </Alert>
            <PasswordInput
              label="마스터 비밀번호"
              placeholder="설정한 비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleUnlock();
              }}
              autoFocus
              required
            />
            <Group justify="space-between" mt="sm">
              <Button variant="subtle" size="xs" color="gray" onClick={onClose}>
                닫기
              </Button>
              <Button color="orange" onClick={handleUnlock} loading={loading} leftSection={<IconLockOpen size={16} />}>
                잠금 해제
              </Button>
            </Group>
          </>
        )}

        {/* 3. 잠금 해제된 상태 -> 관리 모드 */}
        {viewMode === 'manage' && (
          <>
            <Group justify="space-between" p="xs" style={{ background: 'var(--mantine-color-teal-light)', borderRadius: 8 }}>
              <Group gap={8}>
                <ThemeIcon color="teal" variant="filled" size="sm">
                  <IconCheck size={14} />
                </ThemeIcon>
                <Text size="sm" fw={600}>
                  보안 잠금 해제됨 (정상 열람 중)
                </Text>
              </Group>
              <Badge color="teal" variant="light">
                AES-GCM 256
              </Badge>
            </Group>

            <Text size="sm" c="dimmed">
              현재 작성/수정되는 모든 노트는 로컬 스토리지와 Supabase DB에 저장될 때 자동으로 암호화됩니다.
            </Text>

            <Divider />

            <Stack gap="xs">
              <Button
                variant="light"
                color="orange"
                leftSection={<IconLock size={16} />}
                onClick={handleLockNow}
              >
                지금 앱 잠그기 (Lock Now)
              </Button>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                onClick={handleRemove}
                loading={loading}
              >
                암호화 보호 해제 (평문 저장으로 전환)
              </Button>
            </Stack>

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose}>
                닫기
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
