import { AuthProvider } from '@/components/AuthProvider';
import { AuthScreen } from '@/components/AuthScreen';

export default function LoginPage() {
  return <AuthProvider><AuthScreen /></AuthProvider>;
}
