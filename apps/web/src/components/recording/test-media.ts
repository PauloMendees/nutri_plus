import { vi } from 'vitest';

// jsdom não traz MediaRecorder nem getUserMedia; o dublê expõe só o que o
// gravador usa (start/stop/onstop/ondataavailable).
export const recorderOptions: unknown[] = [];
export const trackStop = vi.fn();
export const getUserMedia = vi.fn();

class FakeRecorder {
  constructor(_stream: unknown, options?: unknown) {
    recorderOptions.push(options);
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}

export function installMediaMocks() {
  trackStop.mockReset();
  recorderOptions.length = 0;
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
}
