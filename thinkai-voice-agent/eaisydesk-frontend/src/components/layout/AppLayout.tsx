import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MainHeader from './MainHeader';

export default function AppLayout() {
  const { pathname } = useLocation();
  const showGreeting = pathname.endsWith('/analytics') || pathname === '/' || pathname === '/admin' || pathname === '/admin/';

  return (
    <div id="app">
      <Sidebar />
      <main className="main-content">
        {showGreeting && <MainHeader />}
        <Outlet />
      </main>
    </div>
  );
}
