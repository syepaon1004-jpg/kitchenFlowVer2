import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { initAuthListener } from './stores/authStore';

function App() {
  useEffect(() => {
    const unsubscribe = initAuthListener();
    return () => unsubscribe();
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
