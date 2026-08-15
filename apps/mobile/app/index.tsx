import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../src/api/client';

// Scaffold home screen. Its one job is to prove the wiring end-to-end: the shared
// @af1/api-client, running on React Native, reaches the real API. It calls the
// unauthenticated GET /version (no sign-in needed yet) and shows what came back.
// This screen is a placeholder — the real app UI replaces it.

type State =
  | { status: 'loading' }
  | { status: 'ok'; sha: string; env: string }
  | { status: 'error'; message: string };

export default function Home() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let alive = true;
    api
      .get('/version')
      .then((res) => {
        if (!alive) return;
        const data = res.data as { sha?: string; env?: string };
        setState({ status: 'ok', sha: (data.sha ?? 'unknown').slice(0, 7), env: data.env ?? 'unknown' });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : 'Could not reach the API';
        setState({ status: 'error', message });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.brand}>All For 1</Text>
      <Text style={styles.subtitle}>mobile · scaffold</Text>

      <View style={styles.card}>
        {state.status === 'loading' && (
          <>
            <ActivityIndicator color="#dbff5a" />
            <Text style={styles.muted}>Reaching the API via @af1/api-client…</Text>
          </>
        )}
        {state.status === 'ok' && (
          <>
            <Text style={styles.ok}>API reachable ✓</Text>
            <Text style={styles.mono}>build {state.sha}</Text>
            <Text style={styles.muted}>env: {state.env}</Text>
          </>
        )}
        {state.status === 'error' && (
          <>
            <Text style={styles.err}>Couldn't reach the API</Text>
            <Text style={styles.muted}>{state.message}</Text>
          </>
        )}
      </View>

      <Text style={styles.footnote}>
        Shared logic: @af1/api-client · @af1/core · @af1/validation
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808', paddingHorizontal: 24 },
  brand: { color: '#ffffff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: '#dbff5a', fontSize: 14, fontWeight: '600', marginTop: 2 },
  card: {
    marginTop: 32,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#1c1c1c',
    gap: 8,
  },
  ok: { color: '#dbff5a', fontSize: 18, fontWeight: '700' },
  err: { color: '#f97316', fontSize: 18, fontWeight: '700' },
  mono: { color: '#ffffff', fontSize: 15, fontVariant: ['tabular-nums'] },
  muted: { color: '#9ca3af', fontSize: 13 },
  footnote: { color: '#6b7280', fontSize: 12, marginTop: 'auto', marginBottom: 24 },
});
