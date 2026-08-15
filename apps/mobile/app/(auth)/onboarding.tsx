import { View, StyleSheet } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { EmptyState, Button } from '../../src/components';

// A signed-in Firebase user with no platform profile yet. The full native
// onboarding wizard is deliberately NOT in this phase — shipping a rough one would
// break the standard — so this is an honest holding screen, not a stub pretending
// to work. Sign-in still succeeds; profile creation lands next.
export default function Onboarding() {
  const { signOut } = useAuth();
  return (
    <Screen padded>
      <View style={styles.body}>
        <EmptyState
          icon={UserPlus}
          title="Let's finish your profile"
          message="Native sign-up is coming in the next build. For now you can complete your profile on allfor1.pro and sign back in here."
        />
        <View style={styles.footer}>
          <Button label="Sign out" onPress={signOut} variant="ghost" size="md" fullWidth />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 16 },
});
