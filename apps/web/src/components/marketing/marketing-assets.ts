/**
 * Optional real screenshots for the landing page.
 * When a path is set (and the file exists under /public), the LP prefers
 * that image over the React product mockup.
 *
 * Example after you drop a print:
 *   heroDashboard: '/marketing/hero-dashboard.png',
 */
export const marketingAssets = {
  heroDashboard: null as string | null,
  patientApp: null as string | null,
  silhueta: null as string | null,
} as const;
