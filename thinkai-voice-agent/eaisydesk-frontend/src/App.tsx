import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import PlaceholderPage from './pages/PlaceholderPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HelpPage from './pages/HelpPage';

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
        <Route path="interactions" element={<PlaceholderPage title="Interakciós lista" />} />
        <Route path="clients" element={<PlaceholderPage title="Ügyféllista" />} />
        <Route path="kanban" element={<PlaceholderPage title="Érdeklődőkezelés" />} />
        <Route path="calendar" element={<PlaceholderPage title="Naptár" />} />
        <Route path="outbound" element={<PlaceholderPage title="Kimenő kommunikáció" />} />
        <Route path="settings/*" element={<PlaceholderPage title="Tudástár" />} />
        <Route path="beallitasok" element={<PlaceholderPage title="Beállítások" />} />
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
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
