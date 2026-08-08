import type { SupportRequest, SupportResponse } from '@nutri-plus/shared-types';
import { browserApiFetch } from './browser';

export function submitSupportRequest(body: SupportRequest): Promise<SupportResponse> {
  return browserApiFetch<SupportResponse>('/support', { method: 'POST', body });
}
