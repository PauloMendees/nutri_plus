export type LogoTone = 'color' | 'reverse' | 'dark';

// Brand-mark colors per tone, shared by the stacked `Logo` and the horizontal
// `LogoHorizontal` lockups (one source of truth for the brand palette):
//   `color`   — teal + green, for light surfaces (mirrors the web logo).
//   `reverse` — solid white, for saturated/colored surfaces.
//   `dark`    — teal accents kept, the green parts lifted to the light
//               foreground so the mark stays legible on the near-black app bg.
export const LOGO_TONES: Record<LogoTone, { teal: string; green: string }> = {
  color: { teal: '#14BFA6', green: '#0A5C45' },
  reverse: { teal: '#FFFFFF', green: '#FFFFFF' },
  dark: { teal: '#14BFA6', green: '#E7ECE9' },
};
