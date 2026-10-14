import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { space, useTheme } from './theme';
import { Txt, Wordmark } from './ui';

/** Decorative route line for the auth hero. */
function RouteSketch() {
  const { c } = useTheme();
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute' }}>
      <Path
        d="M180 -10 C 230 30, 250 10, 290 40 S 330 110, 360 70 S 400 20, 420 30"
        stroke={c.lime}
        strokeOpacity={0.7}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <Path
        d="M-10 120 C 50 140, 80 60, 140 70 S 230 150, 280 60 S 360 20, 420 40"
        stroke="#ffffff"
        strokeOpacity={0.08}
        strokeWidth={26}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="360" cy="70" r="6" fill={c.lime} />
      <Circle cx="360" cy="70" r="14" fill={c.lime} fillOpacity={0.18} />
    </Svg>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle(isDark ? 'light' : 'dark');
  }, [isDark]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ backgroundColor: c.hero, paddingTop: insets.top + space.xl, paddingBottom: 64, overflow: 'hidden' }}>
          <LinearGradient colors={['#0E7C66', 'rgba(17,19,22,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
          <RouteSketch />
          <View style={{ maxWidth: 440, width: '100%', alignSelf: 'center', paddingHorizontal: space.xl, gap: space.xl }}>
            <Wordmark size={24} color="#fff" />
            <View style={{ gap: 8, marginTop: space.xl }}>
              <Txt variant="hero" color="#fff">
                {title}
              </Txt>
              {subtitle ? (
                <Txt color="rgba(255,255,255,0.72)" style={{ fontWeight: '500' }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
          </View>
        </View>
        <View style={{ flex: 1, marginTop: -32, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: c.bg }}>
          <View style={{ padding: space.xl, gap: space.lg, maxWidth: 440, width: '100%', alignSelf: 'center', paddingBottom: insets.bottom + space.xl }}>
            {children}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
