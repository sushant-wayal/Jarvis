/**
 * Ethereal Intelligence Design Tokens
 * Source of truth: ui-ux/Design.md & Stitch design screens
 */

export const colors = {
  // The Void & Obsidian Surfaces
  void: '#0A0A0B',
  background: '#131314',
  surface: '#131314',
  surfaceDim: '#131314',
  surfaceBright: '#3A393A',
  surfaceContainerLowest: '#0E0E0F',
  surfaceContainerLow: '#1C1B1C',
  surfaceContainer: '#201F20',
  surfaceContainerHigh: '#2A2A2B',
  surfaceContainerHighest: '#353436',
  surfaceVariant: '#353436',

  // Typography & On-Surface
  onBackground: '#E5E2E3',
  onSurface: '#E5E2E3',
  onSurfaceVariant: '#B9CACB',
  inverseSurface: '#E5E2E3',
  inverseOnSurface: '#313031',
  outline: '#849495',
  outlineVariant: '#3B494B',

  // Electric Cyan Accents (Primary / Active Intelligence)
  primary: '#DBFCFF',
  primaryFixed: '#7DF4FF',
  primaryFixedDim: '#00DBE9',
  primaryContainer: '#00F0FF',
  surfaceTint: '#00DBE9',
  onPrimary: '#00363A',
  onPrimaryContainer: '#006970',
  onPrimaryFixed: '#002022',
  onPrimaryFixedVariant: '#004F54',
  inversePrimary: '#006970',

  // Ethereal Violet (Secondary / Memory & Deep Processing)
  secondary: '#DDB7FF',
  secondaryFixed: '#F0DBFF',
  secondaryFixedDim: '#DDB7FF',
  secondaryContainer: '#6F00BE',
  onSecondary: '#490080',
  onSecondaryContainer: '#D6A9FF',
  onSecondaryFixed: '#2C0051',
  onSecondaryFixedVariant: '#6900B3',

  // Amber / Gold (Tertiary / Suggestions & Timers)
  tertiary: '#FFF5DE',
  tertiaryFixed: '#FFE179',
  tertiaryFixedDim: '#EAC324',
  tertiaryContainer: '#FED639',
  onTertiary: '#3B2F00',
  onTertiaryContainer: '#715D00',
  onTertiaryFixed: '#231B00',
  onTertiaryFixedVariant: '#554500',

  // Error & Critical States
  error: '#FFB4AB',
  errorContainer: '#93000A',
  onError: '#690005',
  onErrorContainer: '#FFDAD6',

  // Glass & Glow Overlays
  glassFill: 'rgba(255, 255, 255, 0.03)',
  glassFillMedium: 'rgba(28, 27, 28, 0.65)',
  glassFillHeavy: 'rgba(14, 14, 15, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.06)',
  glassBorderCyan: 'rgba(0, 240, 255, 0.25)',
  cyanGlow: 'rgba(0, 240, 255, 0.35)',
  violetGlow: 'rgba(111, 0, 190, 0.35)',
} as const;

export const spacing = {
  safeMargin: 24,
  gutter: 16,
  stackSm: 8,
  stackMd: 24,
  stackLg: 48,
  containerPadding: 20,
} as const;

export const rounded = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
} as const;

export const typography = {
  displayLg: {
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    fontWeight: '300' as const,
    color: colors.onSurface,
  },
  headlineLg: {
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.4,
    fontWeight: '500' as const,
    color: colors.onSurface,
  },
  headlineLgMobile: {
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0.5,
    fontWeight: '600' as const,
    color: colors.primaryFixed,
  },
  bodyXl: {
    fontSize: 18,
    lineHeight: 28,
    letterSpacing: 0.2,
    fontWeight: '400' as const,
    color: colors.onSurface,
  },
  bodyMd: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    color: colors.onSurfaceVariant,
  },
  bodySm: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    color: colors.outline,
  },
  labelCaps: {
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    color: colors.outline,
  },
} as const;

export const glassStyle = {
  backgroundColor: colors.glassFill,
  borderColor: colors.glassBorder,
  borderWidth: 1,
  borderRadius: rounded.lg,
};
