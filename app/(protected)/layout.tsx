import AdminGate from '@/components/AdminGate';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
