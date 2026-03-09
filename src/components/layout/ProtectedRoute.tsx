import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  requireAuth?: boolean;
  requireStore?: boolean;
  requireUser?: boolean;
  requireAdmin?: boolean;
}

const ProtectedRoute = ({
  requireAuth = true,
  requireStore = false,
  requireUser = false,
  requireAdmin = false,
}: Props) => {
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 16, color: '#666' }}>로딩 중...</div>;
  }

  if (requireAuth && !user) return <Navigate to="/" replace />;
  if (requireStore && !selectedStore) return <Navigate to="/join" replace />;
  if (requireUser && !selectedUser) return <Navigate to="/join/avatar" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/join/avatar" replace />;

  return <Outlet />;
};

export default ProtectedRoute;
