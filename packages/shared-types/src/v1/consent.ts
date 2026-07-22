export const CURRENT_PRIVACY_POLICY_VERSION = '2026-07-09';

export interface PatientConsent {
  id: string;
  patientId: string;
  policyVersion: string;
  acceptedAt: string; // ISO
}

export interface MyConsentStatus {
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  needsConsent: boolean;
}

export interface AcceptConsentRequest {
  policyVersion: string;
}
