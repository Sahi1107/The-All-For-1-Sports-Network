import { Redirect } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { Screen, ScreenLoader } from '../src/components/Screen';
import { EmptyState } from '../src/components';

// The gate. Every cold start lands here and is routed by auth status — so no
// screen ever renders for a state it isn't meant to.
export default function Index() {
  const { status, retry } = useAuth();

  switch (status) {
    case 'initializing':
    case 'bootstrapping':
      return <ScreenLoader />;

    case 'unauthenticated':
      return <Redirect href="/sign-in" />;

    case 'onboarding':
      return <Redirect href="/onboarding" />;

    case 'authenticated':
      return <Redirect href="/profile" />;

    case 'offline':
      return (
        <Screen>
          <EmptyState
            icon={WifiOff}
            title="You're offline"
            message="We couldn't reach All For 1. Check your connection and try again."
            actionLabel="Try again"
            onAction={retry}
          />
        </Screen>
      );
  }
}
