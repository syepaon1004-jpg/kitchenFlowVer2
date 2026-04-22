import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const PublicOnlyRoute = () => {
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 16, color: '#666' }}>로딩 중...</div>;
  }

  if (user) return <Navigate to="/sim/join" replace />;

  return <Outlet />;
};

export default PublicOnlyRoute;
