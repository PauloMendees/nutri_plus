export function inviteStatusOf(
  userId: string | null,
  firstAppLoginAt: Date | null,
): 'NOT_INVITED' | 'INVITED' | 'ACTIVE' {
  if (!userId) return 'NOT_INVITED';
  if (!firstAppLoginAt) return 'INVITED';
  return 'ACTIVE';
}
