import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MarketingSidebar from './MarketingSidebar';
import MainHeader from './MainHeader';
import NotificationCenter from './NotificationCenter';

export default function AppLayout() {
  const { pathname } = useLocation();
  const showGreeting = pathname.endsWith('/analytics') || pathname === '/' || pathname === '/admin' || pathname === '/admin/';
  const isMarketing = pathname.startsWith('/marketing');

  return (
    <div id="app">
      {isMarketing ? <MarketingSidebar /> : <Sidebar />}
      <main className="main-content">
        {showGreeting && <MainHeader />}
        <NotificationCenter />
        <Outlet />
      </main>
    </div>
  );
}
