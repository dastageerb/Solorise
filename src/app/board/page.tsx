import { AuthProvider } from '@/components/AuthProvider';
import { BoardEntry } from '@/components/BoardEntry';

export default function BoardPage() {
  return <AuthProvider><BoardEntry /></AuthProvider>;
}
