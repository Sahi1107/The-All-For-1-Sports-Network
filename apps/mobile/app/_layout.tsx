import { useCallback, useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { fontMap } from '../src/theme/fonts';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { AuthProvider } from '../src/auth/AuthProvider';

// Hold the native splash until the fonts are in memory, so the first frame the
// user sees is already in Archivo/Inter/Saira — no flash of system font.
SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.name === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  const onLayout = useCallback(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Keep the splash up (render nothing) until fonts resolve. A font *error* still
  // proceeds — the system font is an acceptable degradation, a frozen splash isn't.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <View style={{ flex: 1 }} onLayout={onLayout}>
            <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
          </View>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
