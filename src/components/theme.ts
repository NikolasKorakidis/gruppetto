import { useMemo } from 'react';
import { Platform, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

const light = {
  bg: '#F3F3EF',
  card: '#FFFFFF',
  ink: '#111316',
  muted: '#5E646B',
  faint: '#9A9FA5',
  border: '#E6E5DF',
  subtle: '#EEEDE8',
  brand: '#0E7C66',
  brandSoft: '#DDF1EA',
  onBrand: '#FFFFFF',
  /** Signature accent: lime on dark surfaces, primary call-to-action. */
  lime: '#D4FF3A',
  onLime: '#111316',
  accent: '#FF6B35',
  accentSoft: '#FFE9DF',
  danger: '#D2392A',
  dangerSoft: '#FCE6E2',
  warn: '#A0640C',
  warnSoft: '#FBF0DC',
  going: '#0E7C66',
  maybe: '#B4730F',
  notGoing: '#7D848A',
  overlay: 'rgba(10,12,14,0.5)',
  inverse: '#111316',
  onInverse: '#FFFFFF',
  /** Hero surfaces (headers, highlight cards) stay dark in both themes. */
  hero: '#111316',
  heroSoft: '#1D2125',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.62)',
  shadow: '#0B1A14',
};

export type Colors = typeof light;

const dark: Colors = {
  bg: '#0A0C0E',
  card: '#15181B',
  ink: '#F2F2EE',
  muted: '#A3A9AF',
  faint: '#6B7177',
  border: '#24282C',
  subtle: '#1D2125',
  brand: '#2EC39C',
  brandSoft: '#0F3A30',
  onBrand: '#03231B',
  lime: '#D4FF3A',
  onLime: '#111316',
  accent: '#FF8A5C',
  accentSoft: '#3A2219',
  danger: '#F2735F',
  dangerSoft: '#3A1D19',
  warn: '#E9AE52',
  warnSoft: '#36290F',
  going: '#2EC39C',
  maybe: '#E9AE52',
  notGoing: '#848B91',
  overlay: 'rgba(0,0,0,0.65)',
  inverse: '#F2F2EE',
  onInverse: '#111316',
  hero: '#15181B',
  heroSoft: '#1F2327',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.6)',
  shadow: '#000000',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const MAX_WIDTH = 720;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, isDark };
}

/** Memoised themed StyleSheet factory. */
export function useStyles<T>(factory: (c: Colors) => T): T {
  const { c } = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}

// ---------------------------------------------------------------------------
// Typography: Plus Jakarta Sans. Custom fonts need one family per weight
// (Android ignores fontWeight for custom families), so map weight → family.
// ---------------------------------------------------------------------------
export const FONT_FAMILIES = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

export type Weight = keyof typeof FONT_FAMILIES;

export function font(weight: Weight | TextStyle['fontWeight'] = '400'): TextStyle {
  const w = String(weight === 'bold' ? '700' : weight === 'normal' ? '400' : (weight ?? '400'));
  const key = (w in FONT_FAMILIES ? w : Number(w) >= 800 ? '800' : Number(w) >= 700 ? '700' : Number(w) >= 600 ? '600' : '400') as Weight;
  return { fontFamily: FONT_FAMILIES[key], fontWeight: Platform.OS === 'web' ? (key as TextStyle['fontWeight']) : undefined };
}

/** Soft elevation used by cards and floating elements. */
export function elevation(c: Colors, level: 1 | 2 | 3 = 1): ViewStyle {
  const o = { 1: 0.06, 2: 0.1, 3: 0.18 }[level];
  const r = { 1: 14, 2: 22, 3: 28 }[level];
  return {
    shadowColor: c.shadow,
    shadowOpacity: o,
    shadowRadius: r,
    shadowOffset: { width: 0, height: level * 3 },
    elevation: level * 2,
  };
}

/** Stable colour for avatars without a photo. */
export function hashColor(seed: string) {
  const palette = ['#0E7C66', '#2F6FDB', '#7C4DDB', '#D9468A', '#E4572E', '#C0851C', '#3B8F3A', '#2B8C9E'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
