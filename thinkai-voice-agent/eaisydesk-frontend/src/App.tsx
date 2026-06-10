import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ApprovalProvider } from './context/ApprovalContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import PlaceholderPage from './pages/PlaceholderPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InteractionsPage from './pages/InteractionsPage';
import ClientsPage from './pages/ClientsPage';
import KanbanPage from './pages/KanbanPage';
import CalendarPage from './pages/CalendarPage';
import OutboundPage from './pages/OutboundPage';
import SettingsPage from './pages/SettingsPage';
import BeallitasokPage from './pages/BeallitasokPage';
import HelpPage from './pages/HelpPage';
import ToastContainer from './components/ui/Toast';

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
import './styles/dark-mode.css';
import './styles/responsive.css';

function AuthGate() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="analytics" replace />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="interactions" element={<InteractionsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="outbound" element={<OutboundPage />} />
        <Route path="settings/*" element={<SettingsPage />} />
        <Route path="beallitasok" element={<BeallitasokPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/analytics" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <ThemeProvider>
        <AuthProvider>
          <ApprovalProvider>
            <AuthGate />
            <ToastContainer />
          </ApprovalProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
