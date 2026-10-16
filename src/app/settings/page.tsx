import { AuthProvider } from '@/components/AuthProvider';
import { SettingsScreen } from '@/components/SettingsScreen';

export default function SettingsPage() { return <AuthProvider><SettingsScreen /></AuthProvider>; }
