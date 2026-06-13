import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ApprovalProvider } from './context/ApprovalContext';
import LoginPage from './pages/LoginPage';
import ToastContainer from './components/ui/Toast';
import ApprovalModal from './components/interactions/ApprovalModal';
import Spinner from './components/ui/Spinner';

// Lazy-loaded pages — only downloaded after login
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const MemberDashboardPage = lazy(() => import('./pages/MemberDashboardPage'));
const InteractionsPage = lazy(() => import('./pages/InteractionsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const KanbanPage = lazy(() => import('./pages/KanbanPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const OutboundPage = lazy(() => import('./pages/OutboundPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BeallitasokPage = lazy(() => import('./pages/BeallitasokPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const MarketingPage = lazy(() => import('./pages/marketing/MarketingPage'));
const AutomatizaciokPage = lazy(() => import('./pages/AutomatizaciokPage'));

// Global styles (same CSS as the old admin)
import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/login.css';
import './styles/sidebar.css';
import './styles/calendar.css';
import './styles/components.css';
import './styles/settings.css';
import './styles/analytics.css';
import './styles/tudastar.css';
import './styles/clients.css';
import './styles/kanban.css';
import './styles/outbound.css';
import './styles/marketing.css';
import './styles/dark-mode.css';
import './styles/responsive.css';
import './styles/polish.css';

function SmartRedirect() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  return <Navigate to={isAdmin ? '/analytics' : '/dashboard'} replace />;
}

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <Spinner />
  </div>
);

function AuthGate() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<SmartRedirect />} />
          <Route path="dashboard" element={<MemberDashboardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="interactions" element={<InteractionsPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="outbound" element={<OutboundPage />} />
          <Route path="automatizaciok" element={<AutomatizaciokPage />} />
          <Route path="settings/*" element={<SettingsPage />} />
          <Route path="beallitasok" element={<BeallitasokPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="marketing/*" element={<MarketingPage />} />
          <Route path="*" element={<SmartRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <ThemeProvider>
        <AuthProvider>
          <ApprovalProvider>
            <AuthGate />
            <ApprovalModal />
            <ToastContainer />
          </ApprovalProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

