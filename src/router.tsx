import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicOnlyRoute from './components/layout/PublicOnlyRoute';
import LoginPage from './pages/LoginPage';
import JoinPage from './pages/JoinPage';
import AvatarSelectPage from './pages/AvatarSelectPage';
import GameSetupPage from './pages/GameSetupPage';
import GamePage from './pages/GamePage';
import FeedPage from './pages/FeedPage';
import AdminPage from './pages/AdminPage';
import DevMasterIngredientsPage from './pages/DevMasterIngredientsPage';

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/', element: <LoginPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/join', element: <JoinPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore />,
    children: [
      { path: '/join/avatar', element: <AvatarSelectPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser />,
    children: [
      { path: '/game/setup', element: <GameSetupPage /> },
      { path: '/game', element: <GamePage /> },
      { path: '/feed', element: <FeedPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser requireAdmin />,
    children: [
      { path: '/admin', element: <AdminPage /> },
    ],
  },
  { path: '/dev/master-ingredients', element: <DevMasterIngredientsPage /> },
]);
