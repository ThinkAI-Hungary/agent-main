import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MainHeader from './MainHeader';

export default function AppLayout() {
  return (
    <div id="app">
      <Sidebar />
      <main className="main-content">
        <MainHeader />
        <Outlet />
      </main>
    </div>
  );
}
