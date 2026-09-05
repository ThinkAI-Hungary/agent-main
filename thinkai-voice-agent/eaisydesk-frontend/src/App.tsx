import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ApprovalProvider } from './context/ApprovalContext';
import LoginPage from './pages/LoginPage';
import ToastContainer from './components/ui/Toast';
import ApprovalModal from './components/interactions/ApprovalModal';
import Spinner from './components/ui/Spinner';
import CookieConsentBanner from './components/gdpr/CookieConsentBanner';

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
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const GdprPage = lazy(() => import('./pages/GdprPage'));
const ManagementDashboardPage = lazy(() => import('./pages/ManagementDashboardPage'));

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
import './styles/automatizaciok.css';
import './styles/responsive.css';
import './styles/polish.css';
import './styles/interactions.css';
import './styles/clientprofile.css';

function SmartRedirect() {
  const { user, isSuperAdmin, impersonatedTenant } = useAuth();
  if (!impersonatedTenant && (isSuperAdmin || user?.role === 'superadmin')) {
    return <Navigate to="/management" replace />;
  }
  const isAdminOnly = user?.role === 'admin' || isSuperAdmin;
  return <Navigate to={isAdminOnly ? '/analytics' : '/dashboard'} replace />;
}

function SuperAdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, user } = useAuth();
  if (!isSuperAdmin && user?.role !== 'superadmin') {
    return <Navigate to={user?.role === 'admin' ? '/analytics' : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

function TenantUserRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, user, impersonatedTenant } = useAuth();
  // When not impersonating, superadmin uses dedicated full-width /management.
  // When impersonating a tenant, superadmin is working in that tenant's workspace with full access.
  if (!impersonatedTenant && (isSuperAdmin || user?.role === 'superadmin')) {
    return <Navigate to="/management" replace />;
  }
  return <>{children}</>;
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
        {/* Dedicated standalone full-width route for Superadmin Management without Sidebar */}
        <Route
          path="management"
          element={
            <SuperAdminOnlyRoute>
              <ManagementDashboardPage />
            </SuperAdminOnlyRoute>
          }
        />

        {/* Regular tenant routes with AppLayout (Sidebar + Content) */}
        <Route element={<AppLayout />}>
          <Route index element={<SmartRedirect />} />
          <Route path="dashboard" element={<TenantUserRoute><MemberDashboardPage /></TenantUserRoute>} />
          <Route path="analytics" element={<TenantUserRoute><AnalyticsPage /></TenantUserRoute>} />
          <Route path="interactions" element={<TenantUserRoute><InteractionsPage /></TenantUserRoute>} />
          <Route path="clients" element={<TenantUserRoute><ClientsPage /></TenantUserRoute>} />
          <Route path="kanban" element={<TenantUserRoute><KanbanPage /></TenantUserRoute>} />
          <Route path="calendar" element={<TenantUserRoute><CalendarPage /></TenantUserRoute>} />
          <Route path="outbound" element={<TenantUserRoute><OutboundPage /></TenantUserRoute>} />
          <Route path="automatizaciok" element={<TenantUserRoute><AutomatizaciokPage /></TenantUserRoute>} />
          <Route path="settings/*" element={<TenantUserRoute><SettingsPage /></TenantUserRoute>} />
          <Route path="beallitasok" element={<TenantUserRoute><BeallitasokPage /></TenantUserRoute>} />
          <Route path="help" element={<HelpPage />} />
          <Route path="marketing/*" element={<TenantUserRoute><MarketingPage /></TenantUserRoute>} />
          <Route path="privacy" element={<PrivacyPolicyPage />} />
          <Route path="gdpr" element={<GdprPage />} />
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
            <CookieConsentBanner />
            <ToastContainer />
          </ApprovalProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

