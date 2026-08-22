import { Equals } from 'class-validator';
import type { PatchOnboardingPromptRequest } from '@nutri-plus/shared-types';

export class DismissPromptDto implements PatchOnboardingPromptRequest {
  @Equals(true)
  promptDismissed!: true;
}
