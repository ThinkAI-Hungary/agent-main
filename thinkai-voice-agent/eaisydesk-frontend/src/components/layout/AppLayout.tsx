import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MarketingSidebar from './MarketingSidebar';
import NotificationCenter from './NotificationCenter';
import CommandPalette from './CommandPalette';
import SessionTimeoutGuard from './SessionTimeoutGuard';

export default function AppLayout() {
  const { pathname } = useLocation();
  const isMarketing = pathname.startsWith('/marketing');

  return (
    <div id="app">
      {isMarketing ? <MarketingSidebar /> : <Sidebar />}
      <main className="main-content">
        <NotificationCenter />
        <Outlet />
      </main>
      <CommandPalette />
      <SessionTimeoutGuard />
    </div>
  );
}
