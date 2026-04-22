import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PublicOnlyRoute from './components/layout/PublicOnlyRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import JoinPage from './pages/JoinPage';
import AvatarSelectPage from './pages/AvatarSelectPage';
import GameSetupPage from './pages/GameSetupPage';
import GamePage from './pages/GamePage';
import FeedPage from './pages/FeedPage';
import AdminPage from './pages/AdminPage';
import DevMasterIngredientsPage from './pages/DevMasterIngredientsPage';
import PracticePage from './pages/practice/PracticePage';
import PracticeMenuPage from './pages/practice/PracticeMenuPage';
import PracticeSessionPage from './pages/practice/PracticeSessionPage';
import PracticeSessionFallbackPage from './pages/practice/PracticeSessionFallbackPage';
import PracticeAdminPage from './pages/practice/PracticeAdminPage';

export const router = createBrowserRouter([
  // 새 상위 홈
  { path: '/', element: <HomePage /> },

  // Sim 라우트 (/sim/* 아래로 재배치)
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/sim', element: <LoginPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/sim/join', element: <JoinPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore />,
    children: [
      { path: '/sim/join/avatar', element: <AvatarSelectPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser />,
    children: [
      { path: '/sim/game/setup', element: <GameSetupPage /> },
      { path: '/sim/game', element: <GamePage /> },
      { path: '/sim/feed', element: <FeedPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser requireAdmin />,
    children: [
      { path: '/sim/admin', element: <AdminPage /> },
    ],
  },

  // Practice 라우트 보호 (TASK-20260416-110, TASK-20260420-162)
  {
    element: <ProtectedRoute requireStore />,
    children: [
      { path: '/practice', element: <PracticePage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/practice/menu/:menuId', element: <PracticeMenuPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser />,
    children: [
      { path: '/practice/session/:sessionId', element: <PracticeSessionPage /> },
      { path: '/practice/session/:sessionId/legacy', element: <PracticeSessionFallbackPage /> },
    ],
  },
  {
    element: <ProtectedRoute requireStore requireUser requireAdmin />,
    children: [
      { path: '/practice/admin', element: <PracticeAdminPage /> },
    ],
  },

  // Dev 도구 (변경 없음)
  { path: '/dev/master-ingredients', element: <DevMasterIngredientsPage /> },
]);
