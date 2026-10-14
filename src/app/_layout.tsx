import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { font, useTheme } from '@/components/theme';
import { Button, Loading } from '@/components/ui';
import { onDemoChange } from '@/demo/backend';
import { isDemo } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ClubProvider, useClub } from '@/providers/ClubProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// Demo mode: refresh screens whenever the sample data changes (stands in for Realtime).
if (isDemo) onDemoChange(() => queryClient.invalidateQueries());

// Refetch when the app returns to the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <ClubProvider>
            <Themed />
          </ClubProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function Themed() {
  const { c, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null; // splash screen stays up
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background: c.bg, card: c.card, text: c.ink, border: c.border, primary: c.brand },
      }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </ThemeProvider>
  );
}

const modalClose = {
  headerLeft: () => <Button title="Cancel" variant="ghost" small onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />,
};

function RootNavigator() {
  const { c } = useTheme();
  const { session, initializing, profile, profileLoading, recovering } = useAuth();
  const { activeMemberships, loading: clubsLoading } = useClub();
  const signedIn = !!session;
  const ready = !initializing && !(signedIn && (profileLoading || clubsLoading));

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <Loading />;

  const needsOnboarding = signedIn && !recovering && (!profile?.onboarded || activeMemberships.length === 0);
  const inApp = signedIn && !recovering && !needsOnboarding;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.ink,
        headerTitleStyle: { ...font('700'), fontSize: 17 },
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={recovering}>
        <Stack.Screen name="reset-password" options={{ title: 'New password', headerBackVisible: false }} />
      </Stack.Protected>

      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={inApp}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ride/[id]" options={{ title: '' }} />
        <Stack.Screen name="ride/new" options={{ ...modalClose, title: 'Plan a ride', presentation: 'modal' }} />
        <Stack.Screen name="route/[id]" options={{ title: 'Route' }} />
        <Stack.Screen name="route/upload" options={{ ...modalClose, title: 'Upload route', presentation: 'modal' }} />
        <Stack.Screen name="news/[id]" options={{ title: '' }} />
        <Stack.Screen name="news/new" options={{ ...modalClose, title: 'New post', presentation: 'modal' }} />
        <Stack.Screen name="club/manage" options={{ title: 'Manage club' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="my-rides" options={{ title: 'My rides' }} />
        <Stack.Screen name="calendar" options={{ title: 'Calendar sync' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !recovering}>
        <Stack.Screen name="profile" options={{ title: 'Profile & settings' }} />
        <Stack.Screen name="club/join" options={{ title: 'Join a club' }} />
        <Stack.Screen name="club/new" options={{ title: 'Create a club' }} />
      </Stack.Protected>

      {/* Always reachable: email links and invite links. */}
      <Stack.Screen name="auth/confirm" options={{ headerShown: false }} />
      <Stack.Screen name="join/[code]" options={{ headerShown: false }} />
    </Stack>
  );
}
