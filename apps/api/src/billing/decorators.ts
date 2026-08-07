import { SetMetadata } from '@nestjs/common';
import type { PlanFeature } from '@nutri-plus/shared-types';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';
export const BILLING_EXEMPT_KEY = 'billingExempt';

export const RequiresFeature = (feature: PlanFeature) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
export const BillingExempt = () => SetMetadata(BILLING_EXEMPT_KEY, true);
