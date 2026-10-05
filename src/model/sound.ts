// MODEL / AUDIO: Web Audio API 기반 무음원 알람 차임벨 (띵~동 🔔)
let audioCtx: AudioContext | null = null;

export function playChimeSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const now = audioCtx.currentTime;

    // 맑고 청아한 2단계 실로폰/차임음 (D5 -> A5)
    const playTone = (freq: number, start: number, duration: number, gainLevel: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(gainLevel, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Tone 1: 587.33 Hz (D5)
    playTone(587.33, now, 0.45, 0.2);
    // Tone 2: 880.00 Hz (A5)
    playTone(880.0, now + 0.14, 0.9, 0.25);
  } catch (e) {
    console.warn('Audio chime playback failed:', e);
  }
}
