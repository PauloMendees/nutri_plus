import { vi } from 'vitest';

// jsdom não traz MediaRecorder nem getUserMedia; o dublê expõe só o que o
// gravador usa (start/stop/onstop/ondataavailable).
export const recorderOptions: unknown[] = [];
export const trackStop = vi.fn();
export const getUserMedia = vi.fn();
// deferStop: quando true, onstop chega num setTimeout(0) em vez de na hora —
// reproduz a assincronia real do MediaRecorder para expor race conditions
// (ex.: um segundo stop/discard chegando antes do onstop do primeiro).
export const media = { deferStop: false };

class FakeRecorder {
  constructor(_stream: unknown, options?: unknown) {
    recorderOptions.push(options);
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() {
    if (this.state !== 'recording') {
      throw new DOMException('not recording', 'InvalidStateError');
    }
    this.state = 'inactive';
    if (media.deferStop) {
      setTimeout(() => this.onstop?.(), 0);
    } else {
      this.onstop?.();
    }
  }
}

export function installMediaMocks() {
  trackStop.mockReset();
  recorderOptions.length = 0;
  media.deferStop = false;
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
}
