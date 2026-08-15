import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../src/auth/AuthProvider';
import { isAppleAvailable } from '../../src/auth/apple';
import { Screen } from '../../src/components/Screen';
import { Button, Text } from '../../src/components';
import { useTheme } from '../../src/theme/ThemeProvider';

// The front door. Google everywhere; Sign in with Apple on iOS (App Store rule 4.8,
// since we offer Google) using Apple's own button per their guidelines. A cancelled
// attempt is silent; a real problem shows a calm line, never a raw error.
export default function SignIn() {
  const t = useTheme();
  const { signInGoogle, signInApple, signingIn, notice } = useAuth();
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    isAppleAvailable().then((ok) => { if (alive) setAppleReady(ok); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <Screen padded>
      <View style={styles.body}>
        <View style={styles.brand}>
          <Text variant="display" style={{ fontSize: 40, lineHeight: 42 }}>All For 1</Text>
          <Text variant="body" color={t.color['ink-400']} style={styles.tagline}>
            The home for India's next generation of athletes.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue with Google"
            onPress={signInGoogle}
            loading={signingIn === 'google'}
            disabled={signingIn !== null}
            variant="secondary"
            size="lg"
            fullWidth
          />

          {Platform.OS === 'ios' && appleReady ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                t.name === 'light'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={t.radius.pill}
              style={styles.appleButton}
              onPress={signInApple}
            />
          ) : null}

          {notice ? (
            <Text variant="body" color={t.color['secondary-light']} style={styles.notice}>
              {notice}
            </Text>
          ) : null}
        </View>

        <Text variant="label" color={t.color['gray-custom']} style={styles.legal}>
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'space-between', paddingVertical: 24 },
  brand: { marginTop: 72 },
  tagline: { marginTop: 12, maxWidth: 300 },
  actions: { gap: 12 },
  appleButton: { height: 56, width: '100%' },
  notice: { marginTop: 6, textAlign: 'center' },
  legal: { textAlign: 'center', marginBottom: 8 },
});
