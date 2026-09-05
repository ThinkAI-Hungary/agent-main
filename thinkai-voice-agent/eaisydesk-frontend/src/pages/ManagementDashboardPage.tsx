import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { getToken } from '../api/client';
import '../styles/management.css';

interface ErrorLog {
  id: string;
  created_at: string;
  user_id?: string;
  tenant_id?: string;
  error_type: string;
  severity: 'error' | 'warning' | 'info';
  component?: string;
  action?: string;
  message: string;
  stack_trace?: string;
  context?: Record<string, any>;
  url?: string;
  user_agent?: string;
}

interface ErrorKPIs {
  total_errors: number;
  last_24h_errors: number;
  top_error_type: string;
  affected_tenants_count: number;
}

interface WorkerInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  interval: string;
}

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  plan?: string;
  created_at: string;
  active?: boolean;
  is_active?: boolean;
}

interface UserInfo {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role: string;
  tenant_id?: string;
  tenant_name: string;
  tenant_slug: string;
  created_at: string;
  last_login?: string;
}

interface OverviewFinancials {
  total_monthly_cost_usd: number;
  total_cost_usd: number;
  total_call_minutes: number;
  monthly_call_minutes: number;
  monthly_tokens: {
    input: number;
    output: number;
    input_cost: number;
    output_cost: number;
  };
  all_time_tokens: {
    input: number;
    output: number;
    input_cost: number;
    output_cost: number;
  };
  by_provider: Array<{
    name: string;
    cost: number;
    cost_formatted: string;
    pct: string;
    color: string;
  }>;
  daily_trend: Array<{
    key: string;
    date: string;
    label: string;
    cost: number;
    calls: number;
  }>;
  most_active_company?: {
    id: string;
    name: string;
    slug: string;
    total_cost_usd: number;
    monthly_cost_usd: number;
    calls_count: number;
    duration_minutes: number;
  };
}

interface WorkersSummary {
  healthy_containers: number;
  total_containers: number;
  is_healthy: boolean;
  cpu_usage: number;
  ram_usage_gb: number;
  ram_total_gb: number;
  total_processing: number;
  total_queue_pending: number;
  total_errors_24h: number;
}

interface RecentInteraction {
  id: string;
  title: string;
  company_name: string;
  duration: string;
  created_at: string;
  type: string;
  status: string;
}

interface OverviewData {
  kpis: ErrorKPIs;
  users_count: number;
  companies_count: number;
  uptime_seconds: number;
  app_env: string;
  financials: OverviewFinancials;
  workers_summary: WorkersSummary;
  recent_interactions: RecentInteraction[];
}

interface FinancialsDetail {
  summary: {
    total_cost_usd: number;
    total_call_minutes: number;
    total_sessions: number;
    total_interactions: number;
    active_companies: number;
  };
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    call_seconds: number;
    call_minutes: number;
    calls_count: number;
    interactions_count: number;
    cost_usd: number;
  }>;
  pricing_rates: Record<string, string>;
}

export default function ManagementDashboardPage() {
  const { user, isSuperAdmin, logout, impersonateTenant } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  // Navigation Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'control-center' | 'financials' | 'workers'>('overview');

  // Control Center Sub-Tab (Hibaközpont, Regisztrált cégek, Regisztrált felhasználók)
  const [controlCenterTab, setControlCenterTab] = useState<'errors' | 'tenants' | 'users'>('errors');

  // Loading & Data states
  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [financialsDetail, setFinancialsDetail] = useState<FinancialsDetail | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<Record<string, any>>({});

  // Errors state
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorKpis, setErrorKpis] = useState<ErrorKPIs>({
    total_errors: 0,
    last_24h_errors: 0,
    top_error_type: 'N/A',
    affected_tenants_count: 0,
  });

  // Chart toggle in Overview
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly'>('daily');

  // Filtering & Pagination for Errors
  const [errorPage, setErrorPage] = useState(1);
  const [errorTotalPages, setErrorTotalPages] = useState(1);
  const [errorTotalCount, setErrorTotalCount] = useState(0);
  const [errorSearch, setErrorSearch] = useState('');
  const [debouncedErrorSearch, setDebouncedErrorSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d'>('all');

  // Filtering for Companies
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Filtering for Users
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userCompanyFilter, setUserCompanyFilter] = useState('');

  // UI state
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // User editing modal state (reassign company & change role)
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [editTenantId, setEditTenantId] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('member');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Create Tenant modal state
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState('pro');
  const [newTenantSeedDefaults, setNewTenantSeedDefaults] = useState(true);
  const [newTenantCreateAdmin, setNewTenantCreateAdmin] = useState(false);
  const [newTenantAdminUsername, setNewTenantAdminUsername] = useState('');
  const [newTenantAdminPassword, setNewTenantAdminPassword] = useState('');
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState('');
  const [newTenantAdminFullName, setNewTenantAdminFullName] = useState('');
  const [createTenantSaving, setCreateTenantSaving] = useState(false);
  const [createTenantError, setCreateTenantError] = useState<string | null>(null);

  // Delete Tenant modal state
  const [deletingTenant, setDeletingTenant] = useState<TenantInfo | null>(null);
  const [deleteTenantSaving, setDeleteTenantSaving] = useState(false);
  const [deleteTenantError, setDeleteTenantError] = useState<string | null>(null);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 35);
  };

  const handleOpenCreateTenant = () => {
    setNewTenantName('');
    setNewTenantSlug('');
    setNewTenantPlan('pro');
    setNewTenantSeedDefaults(true);
    setNewTenantCreateAdmin(false);
    setNewTenantAdminUsername('');
    setNewTenantAdminPassword('');
    setNewTenantAdminEmail('');
    setNewTenantAdminFullName('');
    setCreateTenantError(null);
    setShowCreateTenantModal(true);
  };

  const handleNameChangeForNewTenant = (nameVal: string) => {
    setNewTenantName(nameVal);
    setNewTenantSlug(slugify(nameVal));
  };

  const handleOpenEditUser = (u: UserInfo) => {
    setEditingUser(u);
    setEditTenantId(u.tenant_id || '');
    setEditRole(u.role || 'member');
    setEditError(null);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/admin/api/management/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          tenant_id: editTenantId ? editTenantId : null,
          role: editRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Mentés sikertelen');
      }

      // Frissítés a lokális felhasználói listában
      setUsersList((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                role: data.user.role,
                tenant_id: data.user.tenant_id,
                tenant_name: data.user.tenant_name,
                tenant_slug: data.user.tenant_slug,
              }
            : u
        )
      );

      setActionMessage(`Felhasználó (${editingUser.username}) sikeresen frissítve!`);
      setTimeout(() => setActionMessage(null), 4000);
      setEditingUser(null);
    } catch (err: any) {
      setEditError(err.message || 'Hiba történt a mentés során');
    } finally {
      setEditSaving(false);
    }
  };

  // Search debounce for errors
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedErrorSearch(errorSearch), 300);
    return () => clearTimeout(timer);
  }, [errorSearch]);

  const authHeaders = useCallback(() => {
    const currentToken = getToken() || localStorage.getItem('thinkai_admin_token') || localStorage.getItem('sb_admin_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentToken}`,
    };
  }, []);

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/management/overview', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data);
        if (data.kpis) setErrorKpis(data.kpis);
      }
    } catch (err) {
      console.error('Error fetching overview:', err);
    }
  }, [authHeaders]);

  // Fetch Tenants (Regisztrált cégek)
  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/management/tenants', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  }, [authHeaders]);

  // Fetch Users (Regisztrált felhasználók)
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/management/users', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, [authHeaders]);

  // Create new tenant handler
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) {
      setCreateTenantError('A cég nevének megadása kötelező');
      return;
    }
    if (!newTenantSlug.trim()) {
      setCreateTenantError('Az azonosító (slug) megadása kötelező');
      return;
    }
    if (newTenantCreateAdmin) {
      if (!newTenantAdminUsername.trim() || newTenantAdminUsername.trim().length < 3) {
        setCreateTenantError('A kezdő admin felhasználónévnek legalább 3 karakterből kell állnia');
        return;
      }
      if (!newTenantAdminPassword || newTenantAdminPassword.length < 6) {
        setCreateTenantError('A kezdő admin jelszavának legalább 6 karakterből kell állnia');
        return;
      }
    }

    setCreateTenantSaving(true);
    setCreateTenantError(null);
    try {
      const res = await fetch('/admin/api/management/tenants', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: newTenantName.trim(),
          slug: newTenantSlug.trim().toLowerCase(),
          plan: newTenantPlan,
          seed_defaults: newTenantSeedDefaults,
          admin_username: newTenantCreateAdmin ? newTenantAdminUsername.trim() : null,
          admin_password: newTenantCreateAdmin ? newTenantAdminPassword : null,
          admin_email: newTenantCreateAdmin && newTenantAdminEmail.trim() ? newTenantAdminEmail.trim() : null,
          admin_full_name: newTenantCreateAdmin && newTenantAdminFullName.trim() ? newTenantAdminFullName.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Nem sikerült létrehozni a céget');
      }

      setTenants((prev) => [data.tenant, ...prev]);
      setActionMessage(`A(z) '${data.tenant.name}' cég sikeresen létrehozva!`);
      setTimeout(() => setActionMessage(null), 4000);
      setShowCreateTenantModal(false);

      if (data.admin_user) {
        fetchUsers();
      }
    } catch (err: any) {
      setCreateTenantError(err.message || 'Hiba történt a cég létrehozásakor');
    } finally {
      setCreateTenantSaving(false);
    }
  };

  // Impersonate tenant handler
  const handleImpersonateTenant = async (tenant: TenantInfo) => {
    try {
      const res = await fetch(`/admin/api/management/tenants/${tenant.id}/impersonate`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Megszemélyesítés sikertelen');
      }

      impersonateTenant(data.token, data.tenant);
      setActionMessage(`Sikeres belépés a(z) '${tenant.name}' cég nevében!`);
      setTimeout(() => {
        navigate('/analytics');
      }, 150);
    } catch (err: any) {
      alert(err.message || 'Nem sikerült belépni a cég nevében');
    }
  };

  // Delete tenant handler
  const handleDeleteTenantConfirm = async () => {
    if (!deletingTenant) return;
    setDeleteTenantSaving(true);
    setDeleteTenantError(null);
    try {
      const res = await fetch(`/admin/api/management/tenants/${deletingTenant.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'A cég törlése sikertelen');
      }

      setActionMessage(data.message || `A(z) "${deletingTenant.name}" cég sikeresen törölve.`);
      setTimeout(() => setActionMessage(null), 4000);

      // Optimistic state update
      setTenants((prev) => prev.filter((t) => t.id !== deletingTenant.id && t.slug !== deletingTenant.slug));
      setDeletingTenant(null);

      // Refresh data
      fetchTenants();
      fetchOverview();
      fetchFinancials();
    } catch (err: any) {
      console.error('Error deleting tenant:', err);
      setDeleteTenantError(err.message || 'Hiba történt a törlés során');
    } finally {
      setDeleteTenantSaving(false);
    }
  };

  // Fetch Financials Detail
  const fetchFinancials = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/management/financials', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFinancialsDetail(data);
      }
    } catch (err) {
      console.error('Error fetching financials detail:', err);
    }
  }, [authHeaders]);

  // Fetch Workers & System Info
  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/management/workers', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorkers(data.workers || []);
        setSystemInfo(data.system || {});
      }
    } catch (err) {
      console.error('Error fetching workers:', err);
    }
  }, [authHeaders]);

  // Fetch Errors
  const fetchErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', errorPage.toString());
      params.set('page_size', '30');
      if (debouncedErrorSearch) params.set('search', debouncedErrorSearch);
      if (selectedTenant) params.set('tenant_id', selectedTenant);
      if (selectedType) params.set('error_type', selectedType);
      if (selectedSeverity) params.set('severity', selectedSeverity);

      if (timeFilter === '24h') {
        const d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        params.set('date_from', d);
      } else if (timeFilter === '7d') {
        const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        params.set('date_from', d);
      }

      const res = await fetch(`/admin/api/management/errors?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setErrors(data.items || []);
        setErrorTotalPages(data.total_pages || 1);
        setErrorTotalCount(data.total || 0);
        if (data.kpis) setErrorKpis(data.kpis);
      }
    } catch (err) {
      console.error('Error fetching errors:', err);
    }
  }, [errorPage, debouncedErrorSearch, selectedTenant, selectedType, selectedSeverity, timeFilter, authHeaders]);

  // Initial load
  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchOverview(),
      fetchTenants(),
      fetchUsers(),
      fetchFinancials(),
      fetchWorkers(),
      fetchErrors(),
    ]);
    setLoading(false);
  }, [fetchOverview, fetchTenants, fetchUsers, fetchFinancials, fetchWorkers, fetchErrors]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-refresh every 45s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOverview();
      fetchWorkers();
      if (activeTab === 'control-center' && controlCenterTab === 'errors') fetchErrors();
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchOverview, fetchWorkers, fetchErrors, activeTab, controlCenterTab]);

  // Redirect if not superadmin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Toggle company active status
  const handleToggleTenantStatus = async (tenantId: string, currentStatus: boolean, tenantName: string) => {
    const actionLabel = currentStatus ? 'deaktiválni' : 'aktiválni';
    if (!confirm(`Biztosan szeretnéd ${actionLabel} a(z) "${tenantName}" céget?`)) return;

    try {
      const res = await fetch(`/admin/api/management/tenants/${tenantId}/toggle-status`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(data.message || 'Cég státusza frissítve.');
        setTimeout(() => setActionMessage(null), 3000);
        fetchTenants();
        fetchOverview();
        fetchFinancials();
      }
    } catch (err) {
      console.error('Error toggling tenant status:', err);
    }
  };

  // Error row selection & deletion
  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === errors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(errors.map((e) => e.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Biztosan törölni szeretnél ${selectedIds.size} kijelölt hibabejegyzést?`)) return;

    try {
      const res = await fetch('/admin/api/management/errors/batch-delete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setActionMessage('Kijelölt hibák törölve.');
        setTimeout(() => setActionMessage(null), 3000);
        fetchErrors();
        fetchOverview();
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('FIGYELEM: Biztosan törölni szeretnéd az ÖSSZES rögzített hibabejegyzést? Ez nem visszavonható.')) return;
    try {
      const res = await fetch('/admin/api/management/errors/clear-all', {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setActionMessage('Minden hibanapló sikeresen törölve.');
        setTimeout(() => setActionMessage(null), 3000);
        fetchErrors();
        fetchOverview();
      }
    } catch (err) {
      console.error('Clear all error:', err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered lists
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch = !tenantSearch || 
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) || 
      t.slug.toLowerCase().includes(tenantSearch.toLowerCase());
    const isAct = t.is_active !== false;
    const matchesStatus = tenantStatusFilter === 'all' || 
      (tenantStatusFilter === 'active' && isAct) || 
      (tenantStatusFilter === 'inactive' && !isAct);
    return matchesSearch && matchesStatus;
  });

  const filteredUsers = usersList.filter((u) => {
    const matchesSearch = !userSearch ||
      (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = !userRoleFilter || u.role === userRoleFilter;
    const matchesCompany = !userCompanyFilter || u.tenant_id === userCompanyFilter;
    return matchesSearch && matchesRole && matchesCompany;
  });

  const currentMonthName = new Date().toLocaleDateString('hu-HU', { month: 'long' });
  const capitalizedMonth = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  // Financial calculations for charts
  const maxTrendCost = overviewData?.financials.daily_trend?.length
    ? Math.max(...overviewData.financials.daily_trend.map((d) => d.cost), 0.01)
    : 0.01;

  return (
    <div className="mgmt-page-wrapper">
      {/* ── Sticky Topbar matching Visibill (EAISYDESK center logo, theme toggle & logout) ── */}
      <header className="mgmt-topbar">
        <div className="mgmt-topbar-inner">
          {/* Left: Shield icon + Title */}
          <div className="mgmt-topbar-left">
            <div className="mgmt-shield-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="mgmt-topbar-headings">
              <div className="mgmt-topbar-title-row">
                <h1 className="mgmt-topbar-title">
                  {activeTab === 'control-center'
                    ? 'Control Center'
                    : activeTab === 'financials'
                    ? 'Pénzügyi áttekintés'
                    : activeTab === 'workers'
                    ? 'Rendszer & Workerek'
                    : 'Management Dashboard'}
                </h1>
                <span className="mgmt-badge-super">Superadmin</span>
              </div>
              <p className="mgmt-topbar-sub">
                {activeTab === 'control-center'
                  ? 'Hibák, jogosultságok és adatnézet'
                  : activeTab === 'financials'
                  ? 'Hang, LLM és infrastruktúra költségek'
                  : activeTab === 'workers'
                  ? 'Háttérfolyamatok és erőforrás felügyelet'
                  : 'eaisydesk platform áttekintés'}
              </p>
            </div>
          </div>

          {/* Center: EAISYDESK Logo Pill (matching Visibill EAISYBILL) */}
          <div className="mgmt-topbar-center">
            <div className="mgmt-logo-pill-box">
              <span className="mgmt-logo-pill-text">EAISYDESK</span>
            </div>
          </div>

          {/* Right: Actions, Theme toggle & Logout */}
          <div className="mgmt-topbar-right">
            {actionMessage && (
              <span className="mgmt-action-msg">
                {actionMessage}
              </span>
            )}
            <button className="mgmt-btn" onClick={loadAll} title="Adatok frissítése">
              Frissítés
            </button>
            {activeTab === 'control-center' && controlCenterTab === 'errors' && (
              <button className="mgmt-btn mgmt-btn-danger" onClick={handleClearAll}>
                Napló ürítése
              </button>
            )}

            {/* Theme toggle */}
            <button
              className="mgmt-topbar-icon-btn"
              onClick={toggleTheme}
              aria-label="Téma váltás"
              title={isDark ? 'Váltás világos módra' : 'Váltás sötét módra'}
            >
              {isDark ? (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Logout button */}
            <button
              className="mgmt-topbar-logout-btn"
              onClick={() => logout()}
              aria-label="Kijelentkezés"
              title="Kijelentkezés a rendszerből"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span>Kijelentkezés</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs directly under topbar */}
        <div className="mgmt-topbar-tabs">
          <div className="mgmt-topbar-tabs-inner">
            <button
              className={`mgmt-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Áttekintés</span>
            </button>
            <button
              className={`mgmt-tab ${activeTab === 'control-center' ? 'active' : ''}`}
              onClick={() => setActiveTab('control-center')}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              <span>Control Center</span>
              {errorTotalCount > 0 && (
                <span className="mgmt-tab-badge" style={{ background: 'rgba(239, 68, 68, 0.25)', color: 'inherit' }}>
                  {errorTotalCount}
                </span>
              )}
            </button>
            <button
              className={`mgmt-tab ${activeTab === 'financials' ? 'active' : ''}`}
              onClick={() => setActiveTab('financials')}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span>Pénzügyi áttekintés</span>
            </button>
            <button
              className={`mgmt-tab ${activeTab === 'workers' ? 'active' : ''}`}
              onClick={() => setActiveTab('workers')}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
              <span>Rendszer & Workerek</span>
              <span className="mgmt-tab-badge">{workers.length}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="mgmt-container">
        {/* Loading Spinner */}
        {loading && (
          <div className="mgmt-loading-box">
            <div className="mgmt-spinner" />
            <p>Vezérlőpult és szuperadmin adatok betöltése...</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════
            TAB 1: ÁTTEKINTÉS (VISIBILL BENTO-GRID)
            ═══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div>
            {/* Top 4 Stat Cards */}
            <div className="mgmt-kpi-grid">
              <div
                className="mgmt-kpi-card"
                onClick={() => {
                  setActiveTab('control-center');
                  setControlCenterTab('users');
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="mgmt-kpi-header">
                  <span className="mgmt-kpi-label">Regisztrált Felhasználók</span>
                </div>
                <div className="mgmt-stat-big">{overviewData?.users_count ?? usersList.length}</div>
                <div className="mgmt-kpi-hint">Központi fiókok és munkatársak</div>
              </div>

              <div
                className="mgmt-kpi-card"
                onClick={() => {
                  setActiveTab('control-center');
                  setControlCenterTab('tenants');
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="mgmt-kpi-header">
                  <span className="mgmt-kpi-label">Regisztrált Cégek</span>
                </div>
                <div className="mgmt-stat-big">{overviewData?.companies_count ?? tenants.length}</div>
                <div className="mgmt-kpi-hint">
                  {tenants.filter(t => t.is_active !== false).length} aktív bérlő
                </div>
              </div>

            <div className="mgmt-kpi-card" onClick={() => setActiveTab('financials')} style={{ cursor: 'pointer' }}>
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Havi Összköltség ({capitalizedMonth})</span>
              </div>
              <div className="mgmt-stat-big" style={{ color: 'var(--figma-accent3, #14b8ad)' }}>
                ${overviewData ? overviewData.financials.total_monthly_cost_usd.toFixed(4) : '0.0000'}
              </div>
              <div className="mgmt-kpi-hint">
                {overviewData ? `${overviewData.financials.monthly_call_minutes} perc hívás és LLM` : 'Számítás alatt...'}
              </div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Legaktívabb Cég (Összesen)</span>
              </div>
              <div className="mgmt-stat-big" style={{ fontSize: '20px' }}>
                {overviewData?.financials.most_active_company?.name || 'Nincs adat'}
              </div>
              <div className="mgmt-kpi-hint">
                {overviewData?.financials.most_active_company 
                  ? `Összesen: $${overviewData.financials.most_active_company.total_cost_usd.toFixed(2)} (${overviewData.financials.most_active_company.duration_minutes} perc)`
                  : 'Nincs hívás rögzítve'}
              </div>
            </div>
          </div>

          {/* Bento Grid */}
          <div className="mgmt-bento-grid">
            {/* Bento Col 1: LLM & Hang Pénzügyi Áttekintés */}
            <div className="mgmt-bento-card">
              <div>
                <div className="mgmt-bento-header">
                  <span className="mgmt-bento-title">Hang & LLM Pénzügyi Áttekintés</span>
                  <span className="mgmt-bento-tag">Tárgyhó</span>
                </div>

                <div>
                  <div className="mgmt-stat-subrow">
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      HAVI ÖSSZKÖLTSÉG ({capitalizedMonth.toUpperCase()})
                    </span>
                  </div>
                  <div className="mgmt-stat-big" style={{ margin: '4px 0 12px 0' }}>
                    ${overviewData ? overviewData.financials.total_monthly_cost_usd.toFixed(4) : '0.0000'}
                  </div>

                  <div className="mgmt-stat-subbox">
                    <div className="mgmt-stat-subrow">
                      <span>Input tokenek (Gemini):</span>
                      <strong style={{ color: 'var(--text)' }}>
                        {overviewData ? `${(overviewData.financials.monthly_tokens.input / 1000).toFixed(1)}k ($${overviewData.financials.monthly_tokens.input_cost.toFixed(4)})` : '-'}
                      </strong>
                    </div>
                    <div className="mgmt-stat-subrow">
                      <span>Output tokenek (Gemini):</span>
                      <strong style={{ color: 'var(--text)' }}>
                        {overviewData ? `${(overviewData.financials.monthly_tokens.output / 1000).toFixed(1)}k ($${overviewData.financials.monthly_tokens.output_cost.toFixed(4)})` : '-'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div className="mgmt-stat-subrow">
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      ÖSSZES EDDIGI KÖLTSÉG
                    </span>
                  </div>
                  <div className="mgmt-stat-big" style={{ fontSize: '22px', color: 'var(--figma-accent3, #14b8ad)', margin: '4px 0 10px 0' }}>
                    ${overviewData ? overviewData.financials.total_cost_usd.toFixed(4) : '0.0000'}
                  </div>
                  <div className="mgmt-stat-subbox">
                    <div className="mgmt-stat-subrow">
                      <span>Összes hívásidő:</span>
                      <strong style={{ color: 'var(--text)' }}>
                        {overviewData ? `${overviewData.financials.total_call_minutes} perc` : '-'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider Breakdown */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Költség Megoszlás (Szolgáltatók)
                </span>
                <div className="mgmt-progress-list">
                  {(overviewData?.financials.by_provider || []).map((p, idx) => (
                    <div key={idx} className="mgmt-progress-item">
                      <div className="mgmt-progress-meta">
                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.pct}% ({p.cost_formatted})</span>
                      </div>
                      <div className="mgmt-progress-track">
                        <div
                          className="mgmt-progress-fill"
                          style={{
                            width: `${p.pct}%`,
                            background: p.name.includes('Gemini') ? '#a855f7' :
                                        p.name.includes('Cartesia') ? '#14b8a6' :
                                        p.name.includes('Soniox') ? '#10b981' :
                                        p.name.includes('Telnyx') ? '#3b82f6' : '#64748b'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bento Col 2: Worker Státusz & 7 napos Költség Trend */}
            <div className="mgmt-bento-col">
              {/* Worker Status Subcard */}
              <div className="mgmt-bento-card">
                <div>
                  <div className="mgmt-bento-header">
                    <span className="mgmt-bento-title">Worker Státusz</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green, #22c55e)' }}>
                      <span className="mgmt-pulsing-dot" />
                      {overviewData?.workers_summary.healthy_containers ?? 6}/{overviewData?.workers_summary.total_containers ?? 6} Folyamat fut
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    <div className="mgmt-subbox-item">
                      <span className="mgmt-subbox-item-label">
                        Állapot
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--green, #22c55e)' }}>
                        Fut (Egészséges)
                      </strong>
                    </div>
                    <div
                      className="mgmt-subbox-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setActiveTab('workers')}
                    >
                      <span className="mgmt-subbox-item-label">
                        Feldolgozás alatt
                      </span>
                      <strong className="mgmt-subbox-item-val">
                        0 aktív feladat
                      </strong>
                    </div>
                  </div>

                  {/* CPU / RAM Usage */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div className="mgmt-stat-subrow" style={{ fontSize: '11px', marginBottom: '4px' }}>
                        <span>CPU Terheltség</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{overviewData?.workers_summary.cpu_usage ?? 18}%</span>
                      </div>
                      <div className="mgmt-progress-track">
                        <div className="mgmt-progress-fill" style={{ width: `${overviewData?.workers_summary.cpu_usage ?? 18}%`, background: '#14b8a6' }} />
                      </div>
                    </div>
                    <div>
                      <div className="mgmt-stat-subrow" style={{ fontSize: '11px', marginBottom: '4px' }}>
                        <span>RAM Használat</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {overviewData?.workers_summary.ram_usage_gb ?? 1.4} GB / {overviewData?.workers_summary.ram_total_gb ?? 4.0} GB
                        </span>
                      </div>
                      <div className="mgmt-progress-track">
                        <div className="mgmt-progress-fill" style={{ width: `${((overviewData?.workers_summary.ram_usage_gb ?? 1.4) / (overviewData?.workers_summary.ram_total_gb ?? 4.0)) * 100}%`, background: '#14b8a6' }} />
                      </div>
                    </div>
                  </div>

                  {/* 24h Errors row */}
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Feldolgozási hibák (24h)
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: (overviewData?.workers_summary.total_errors_24h ?? 0) > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      color: (overviewData?.workers_summary.total_errors_24h ?? 0) > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)'
                    }}>
                      {overviewData?.workers_summary.total_errors_24h ?? 0} hiba
                    </span>
                  </div>
                </div>
              </div>

              {/* 7-Day Cost Chart Subcard */}
              <div className="mgmt-bento-card" style={{ flex: 1 }}>
                <div className="mgmt-bento-header">
                  <span className="mgmt-bento-title">Napi Költségek (7 nap)</span>
                  <div className="mgmt-trend-toggle">
                    <button
                      className={`mgmt-trend-btn ${trendMode === 'daily' ? 'active' : ''}`}
                      onClick={() => setTrendMode('daily')}
                    >
                      Napi
                    </button>
                    <button
                      className={`mgmt-trend-btn ${trendMode === 'weekly' ? 'active' : ''}`}
                      onClick={() => setTrendMode('weekly')}
                    >
                      Heti
                    </button>
                  </div>
                </div>

                {/* Bars */}
                <div className="mgmt-chart-bars">
                  {(overviewData?.financials.daily_trend || []).map((d, idx, arr) => {
                    const pct = Math.max((d.cost / maxTrendCost) * 100, 8);
                    const isLast = idx === arr.length - 1;
                    return (
                      <div key={d.key} className="mgmt-chart-bar-col" title={`${d.date}: $${d.cost.toFixed(4)} (${d.calls} esemény)`}>
                        <span className="mgmt-chart-bar-val">${d.cost.toFixed(2)}</span>
                        <div
                          className="mgmt-chart-bar-pillar"
                          style={{
                            height: `${pct}%`,
                            background: isLast 
                              ? 'linear-gradient(180deg, #14b8ad 0%, rgba(20, 184, 173, 0.4) 100%)' 
                              : 'linear-gradient(180deg, #3b82f6 0%, rgba(59, 130, 246, 0.4) 100%)'
                          }}
                        />
                        <span className="mgmt-chart-bar-lbl">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bento Col 3: Rendszer Állapot & Aktivitások (HIBAJEGYEK NÉLKÜL!) */}
            <div className="mgmt-bento-col">
              {/* App Errors Card */}
              <div className="mgmt-bento-card">
                <div>
                  <div className="mgmt-bento-header">
                    <span className="mgmt-bento-title">Alkalmazás Hibák</span>
                    <button
                      className="mgmt-btn"
                      style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                      onClick={() => {
                        setActiveTab('control-center');
                        setControlCenterTab('errors');
                      }}
                    >
                      Részletek →
                    </button>
                  </div>

                  <div
                    className="mgmt-error-nav-box"
                    onClick={() => {
                      setActiveTab('control-center');
                      setControlCenterTab('errors');
                    }}
                  >
                    <div>
                      <strong className="mgmt-error-nav-title">
                        Központi Hibanapló
                      </strong>
                      <span className="mgmt-error-nav-sub">
                        Kattints a részletes hibanapló megnyitásához
                      </span>
                    </div>
                    <span style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: (overviewData?.kpis.total_errors ?? 0) > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      color: (overviewData?.kpis.total_errors ?? 0) > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)'
                    }}>
                      {overviewData?.kpis.total_errors ?? 0}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                    <div className="mgmt-subbox-item" style={{ padding: '8px 10px' }}>
                      <span className="mgmt-subbox-item-label">Érintett cégek</span>
                      <strong className="mgmt-subbox-item-val">{overviewData?.kpis.affected_tenants_count ?? 0} cég</strong>
                    </div>
                    <div className="mgmt-subbox-item" style={{ padding: '8px 10px' }}>
                      <span className="mgmt-subbox-item-label">24h hiba</span>
                      <strong style={{ fontSize: '12px', color: (overviewData?.kpis.last_24h_errors ?? 0) > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)' }}>
                        {overviewData?.kpis.last_24h_errors ?? 0} db
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Voice Calls & Interactions Card */}
              <div className="mgmt-bento-card" style={{ flex: 1 }}>
                <div>
                  <div className="mgmt-bento-header">
                    <span className="mgmt-bento-title">Legutóbbi Hanghívások & Interakciók</span>
                    <span className="mgmt-bento-tag">LiveKit & SIP</span>
                  </div>

                  <div className="mgmt-recent-list">
                    {(overviewData?.recent_interactions || []).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        Nincs rögzített hívás.
                      </div>
                    ) : (
                      overviewData?.recent_interactions.map((it) => (
                        <div key={it.id} className="mgmt-recent-item">
                          <div className="mgmt-recent-info">
                            <span className="mgmt-recent-title">{it.title}</span>
                            <span className="mgmt-recent-sub">
                              {it.company_name} • {it.duration} • {new Date(it.created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="mgmt-recent-badge">{it.status}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

            {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 2: CONTROL CENTER (HIBAKÖZPONT, REGISZTRÁLT CÉGEK, REGISZTRÁLT FELHASZNÁLÓK)
          ═══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'control-center' && (
        <div className="mgmt-control-center-wrapper">
          {/* Sub-Navigation Pills (Visibill style) */}
          <div className="mgmt-subnav-container">
            <div className="mgmt-subnav-pills">
              <button
                className={`mgmt-subnav-pill ${controlCenterTab === 'errors' ? 'active' : ''}`}
                onClick={() => setControlCenterTab('errors')}
              >
                <svg className="mgmt-subnav-icon" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Hibaközpont</span>
                <span className="mgmt-subnav-badge">{errorTotalCount}</span>
              </button>

              <button
                className={`mgmt-subnav-pill ${controlCenterTab === 'tenants' ? 'active' : ''}`}
                onClick={() => setControlCenterTab('tenants')}
              >
                <svg className="mgmt-subnav-icon" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span>Regisztrált cégek</span>
                <span className="mgmt-subnav-badge">{tenants.length}</span>
              </button>

              <button
                className={`mgmt-subnav-pill ${controlCenterTab === 'users' ? 'active' : ''}`}
                onClick={() => setControlCenterTab('users')}
              >
                <svg className="mgmt-subnav-icon" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Regisztrált felhasználók</span>
                <span className="mgmt-subnav-badge">{usersList.length}</span>
              </button>
            </div>
          </div>

          {/* Sub-tab 1: Hibaközpont */}
          {controlCenterTab === 'errors' && (
            <>
          {/* Error KPIs */}
          <div className="mgmt-kpi-grid">
            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Összes Hiba</span>
              </div>
              <div className="mgmt-kpi-val">{errorKpis.total_errors}</div>
              <div className="mgmt-kpi-hint">Rendszerszinten naplózva</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Elmúlt 24 óra</span>
              </div>
              <div className="mgmt-kpi-val" style={{ color: errorKpis.last_24h_errors > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)' }}>
                {errorKpis.last_24h_errors}
              </div>
              <div className="mgmt-kpi-hint">Friss események</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Leggyakoribb Kategória</span>
              </div>
              <div className="mgmt-kpi-val" style={{ fontSize: '18px', textTransform: 'uppercase' }}>
                {errorKpis.top_error_type}
              </div>
              <div className="mgmt-kpi-hint">Fő hibaforrás</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Érintett Cégek</span>
              </div>
              <div className="mgmt-kpi-val">{errorKpis.affected_tenants_count}</div>
              <div className="mgmt-kpi-hint">{tenants.length} regisztrált cégből</div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="mgmt-filter-bar">
            <input
              type="text"
              className="mgmt-filter-input"
              placeholder="Keresés hibaüzenetben, stack trace-ben vagy komponensben..."
              value={errorSearch}
              onChange={(e) => setErrorSearch(e.target.value)}
            />

            <select
              className="mgmt-filter-select"
              value={selectedTenant}
              onChange={(e) => { setSelectedTenant(e.target.value); setErrorPage(1); }}
            >
              <option value="">Összes Cég</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.slug || t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>

            <select
              className="mgmt-filter-select"
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setErrorPage(1); }}
            >
              <option value="">Minden Hibatípus</option>
              <option value="frontend">Frontend UI</option>
              <option value="render">React Render</option>
              <option value="api_call">API Hívás</option>
              <option value="auth">Autentikáció</option>
              <option value="db_query">Adatbázis</option>
              <option value="worker">Háttér Worker</option>
              <option value="livekit">LiveKit Voice</option>
              <option value="unhandled">Unhandled Exception</option>
            </select>

            <select
              className="mgmt-filter-select"
              value={selectedSeverity}
              onChange={(e) => { setSelectedSeverity(e.target.value); setErrorPage(1); }}
            >
              <option value="">Minden Súlyosság</option>
              <option value="error">Error (Hiba)</option>
              <option value="warning">Warning (Figyelmeztetés)</option>
              <option value="info">Info (Tájékoztató)</option>
            </select>

            <select
              className="mgmt-filter-select"
              value={timeFilter}
              onChange={(e) => { setTimeFilter(e.target.value as any); setErrorPage(1); }}
            >
              <option value="all">Minden időszak</option>
              <option value="24h">Elmúlt 24 óra</option>
              <option value="7d">Elmúlt 7 nap</option>
            </select>
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '6px',
              padding: '10px 16px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent2, #3b82f6)' }}>
                {selectedIds.size} bejegyzés kijelölve
              </span>
              <button className="mgmt-btn mgmt-btn-danger" onClick={handleDeleteSelected}>
                Kijelöltek törlése ({selectedIds.size})
              </button>
            </div>
          )}

          {/* Table */}
          <div className="mgmt-table-wrapper">
            <div className="mgmt-table-header-bar">
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                Hibalista ({errorTotalCount} találat)
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim, #94a3b8)' }}>
                Kattints a sorra a stack trace és context kibontásához
              </span>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Hibanapló betöltése...
              </div>
            ) : errors.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nem található a szűrésnek megfelelő hiba. A rendszer stabilan fut.
              </div>
            ) : (
              <table className="mgmt-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === errors.length && errors.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Időpont</th>
                    <th>Súlyosság</th>
                    <th>Típus</th>
                    <th>Cég (Tenant)</th>
                    <th>Komponens / Akció</th>
                    <th>Hibaüzenet</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err) => {
                    const isExpanded = expandedRowId === err.id;
                    const isSelected = selectedIds.has(err.id);

                    return (
                      <React.Fragment key={err.id}>
                        <tr
                          className={`mgmt-row ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => setExpandedRowId(isExpanded ? null : err.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => toggleSelectRow(err.id, e as any)}
                            />
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: '12px' }}>
                            {new Date(err.created_at).toLocaleString('hu-HU')}
                          </td>
                          <td>
                            <span className={`mgmt-badge mgmt-badge-${err.severity}`}>
                              {err.severity}
                            </span>
                          </td>
                          <td>
                            <span className="mgmt-type-tag">{err.error_type}</span>
                          </td>
                          <td>
                            <code>{err.tenant_id || 'globális'}</code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{err.component || '-'}</div>
                            {err.action && (
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{err.action}</div>
                            )}
                          </td>
                          <td style={{ maxWidth: '400px' }}>
                            <div style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: isExpanded ? 'normal' : 'nowrap',
                              fontWeight: 500,
                            }}>
                              {err.message}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable row detail */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0 }}>
                              <div className="mgmt-detail-box">
                                <div className="mgmt-detail-grid">
                                  <div className="mgmt-detail-item">
                                    <div className="mgmt-detail-item-label">Hiba Azonosító (ID)</div>
                                    <code>{err.id}</code>
                                  </div>
                                  <div className="mgmt-detail-item">
                                    <div className="mgmt-detail-item-label">URL / Útvonal</div>
                                    <div>{err.url || 'Nem elérhető'}</div>
                                  </div>
                                  <div className="mgmt-detail-item">
                                    <div className="mgmt-detail-item-label">Felhasználó / Agent</div>
                                    <div>{err.user_id || 'Anonim / Rendszer'}</div>
                                  </div>
                                </div>

                                {err.context && Object.keys(err.context).length > 0 && (
                                  <div style={{ marginBottom: '14px' }}>
                                    <div className="mgmt-detail-item-label">Környezeti Adatok (Context JSON)</div>
                                    <pre className="mgmt-code-block">
                                      {JSON.stringify(err.context, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {err.stack_trace && (
                                  <div>
                                    <div className="mgmt-detail-item-label">Stack Trace</div>
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        className="mgmt-copy-btn"
                                        onClick={() => copyToClipboard(err.stack_trace!, err.id)}
                                      >
                                        {copiedId === err.id ? 'Másolva' : 'Másolás'}
                                      </button>
                                      <pre className="mgmt-code-block">{err.stack_trace}</pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {errorTotalPages > 1 && (
              <div className="mgmt-pagination">
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Oldal: {errorPage} / {errorTotalPages} ({errorTotalCount} bejegyzés)
                </span>
                <div className="mgmt-page-btns">
                  <button
                    className="mgmt-btn"
                    disabled={errorPage <= 1}
                    onClick={() => setErrorPage((p) => Math.max(1, p - 1))}
                  >
                    ← Előző
                  </button>
                  <button
                    className="mgmt-btn"
                    disabled={errorPage >= errorTotalPages}
                    onClick={() => setErrorPage((p) => Math.min(errorTotalPages, p + 1))}
                  >
                    Következő →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
          )}

          {/* Sub-tab 2: Regisztrált cégek */}
          {controlCenterTab === 'tenants' && (
            <div className="mgmt-table-wrapper">
          <div className="mgmt-table-header-bar">
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                Regisztrált Cégek ({filteredTenants.length} / {tenants.length})
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                Bérlői hozzáférések, csomagok és aktív státusz kezelése
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                className="mgmt-filter-input"
                style={{ padding: '5px 10px', fontSize: '12px', minWidth: '180px' }}
                placeholder="Keresés cég névben vagy azonosítóban..."
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
              />
              <select
                className="mgmt-filter-select"
                style={{ padding: '5px 10px', fontSize: '12px', minWidth: '130px' }}
                value={tenantStatusFilter}
                onChange={(e) => setTenantStatusFilter(e.target.value as any)}
              >
                <option value="all">Minden státusz</option>
                <option value="active">Csak Aktív</option>
                <option value="inactive">Csak Inaktív</option>
              </select>
              <button
                className="mgmt-btn mgmt-btn-primary"
                style={{ padding: '5px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                onClick={handleOpenCreateTenant}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Új Cég Hozzáadása
              </button>
            </div>
          </div>

          <table className="mgmt-table">
            <thead>
              <tr>
                <th>Cég Neve</th>
                <th>Azonosító (Slug)</th>
                <th>Csomag</th>
                <th>Létrehozva</th>
                <th>Státusz</th>
                <th>Státusz Váltása</th>
                <th>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Nem található cég a megadott szűrési feltételekkel.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const isAct = t.is_active !== false;
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700 }}>{t.name}</td>
                      <td><code>{t.slug}</code></td>
                      <td>
                        <span className="mgmt-plan-badge">
                          {t.plan || 'PRO'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                        {new Date(t.created_at).toLocaleDateString('hu-HU')}
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '12px',
                          color: isAct ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'
                        }}>
                          {isAct ? 'Aktív' : 'Inaktív'}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`mgmt-toggle-btn ${isAct ? 'active' : 'inactive'}`}
                          onClick={() => handleToggleTenantStatus(t.id, isAct, t.name)}
                        >
                          {isAct ? 'Deaktiválás' : 'Aktiválás'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            className="mgmt-btn"
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              color: 'var(--figma-accent3, #14b8ad)',
                              borderColor: 'rgba(20, 184, 173, 0.35)'
                            }}
                            onClick={() => handleImpersonateTenant(t)}
                            title="Belépés a cég felületére (Superadmin megszemélyesítés)"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                              <polyline points="10 17 15 12 10 7" />
                              <line x1="15" y1="12" x2="3" y2="12" />
                            </svg>
                            Belépés
                          </button>
                          <button
                            className="mgmt-btn"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => {
                              setSelectedTenant(t.slug || t.id);
                              setControlCenterTab('errors');
                            }}
                          >
                            Hibák
                          </button>
                          {/* Törlés gomb */}
                          {t.slug === 'rivergate' || t.slug === 'default' ? (
                            <span
                              title="Az alapértelmezett rendszer cég védett, nem törölhető"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: 'var(--text-muted, #94a3b8)',
                                opacity: 0.6,
                                cursor: 'not-allowed'
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              Védett
                            </span>
                          ) : (
                            <button
                              className="mgmt-btn mgmt-btn-outline-danger"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              onClick={() => {
                                setDeletingTenant(t);
                                setDeleteTenantError(null);
                              }}
                              title={`"${t.name}" cég és minden adata végleges törlése`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              Törlés
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          )}

          {/* Sub-tab 3: Regisztrált felhasználók */}
          {controlCenterTab === 'users' && (
            <div className="mgmt-table-wrapper">
          <div className="mgmt-table-header-bar">
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                Regisztrált Felhasználók ({filteredUsers.length} / {usersList.length})
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                Globális felhasználói nyilvántartás minden cégből
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="mgmt-filter-input"
                style={{ padding: '5px 10px', fontSize: '12px', minWidth: '180px' }}
                placeholder="Keresés névben vagy emailben..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <select
                className="mgmt-filter-select"
                style={{ padding: '5px 10px', fontSize: '12px', minWidth: '140px' }}
                value={userCompanyFilter}
                onChange={(e) => setUserCompanyFilter(e.target.value)}
              >
                <option value="">Minden cég</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                className="mgmt-filter-select"
                style={{ padding: '5px 10px', fontSize: '12px', minWidth: '130px' }}
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
              >
                <option value="">Minden szerepkör</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="member">Member</option>
              </select>
            </div>
          </div>

          <table className="mgmt-table">
            <thead>
              <tr>
                <th>Teljes Név</th>
                <th>Felhasználónév / Email</th>
                <th>Hozzárendelt Cég</th>
                <th>Szerepkör</th>
                <th>Utolsó Belépés</th>
                <th>Regisztráció Dátuma</th>
                <th style={{ textAlign: 'right' }}>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Nem található felhasználó a megadott szűrési feltételekkel.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.full_name || u.username}</td>
                    <td>
                      <div><strong>{u.username}</strong></div>
                      {u.email && <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{u.email}</div>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.tenant_name}</span>
                      {u.tenant_slug && <code style={{ marginLeft: '6px', fontSize: '11px' }}>({u.tenant_slug})</code>}
                    </td>
                    <td>
                      <span className={`mgmt-role-badge ${u.role}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleString('hu-HU') : 'Még nem lépett be'}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                      {new Date(u.created_at).toLocaleDateString('hu-HU')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="mgmt-btn"
                        style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        onClick={() => handleOpenEditUser(u)}
                        title="Cég és szerepkör szerkesztése"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Szerkesztés
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          )}
        </div>
      )}

{/* ═══════════════════════════════════════════════════════════════════════════
          TAB 4: PÉNZÜGYI ÁTTEKINTÉS
          ═══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'financials' && (
        <div>
          {/* Financial summary stats */}
          <div className="mgmt-kpi-grid">
            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Összesített Költség</span>
              </div>
              <div className="mgmt-stat-big" style={{ color: 'var(--figma-accent3, #14b8ad)' }}>
                ${financialsDetail?.summary.total_cost_usd.toFixed(4) || '0.0000'}
              </div>
              <div className="mgmt-kpi-hint">Voice, LLM és infrastruktúra</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Összes Hívásidő</span>
              </div>
              <div className="mgmt-stat-big">
                {financialsDetail?.summary.total_call_minutes || 0} perc
              </div>
              <div className="mgmt-kpi-hint">{financialsDetail?.summary.total_sessions || 0} lezárt hívásból</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Ügyfél Interakciók</span>
              </div>
              <div className="mgmt-stat-big">
                {financialsDetail?.summary.total_interactions || 0} db
              </div>
              <div className="mgmt-kpi-hint">E-mailek, hívások, social üzenetek</div>
            </div>

            <div className="mgmt-kpi-card">
              <div className="mgmt-kpi-header">
                <span className="mgmt-kpi-label">Aktív Cégek</span>
              </div>
              <div className="mgmt-stat-big">
                {financialsDetail?.summary.active_companies || 0}
              </div>
              <div className="mgmt-kpi-hint">{tenants.length} regisztrált cégből</div>
            </div>
          </div>

          {/* Company breakdown table */}
          <div className="mgmt-table-wrapper" style={{ marginBottom: '24px' }}>
            <div className="mgmt-table-header-bar">
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                Cégek Szerinti Használat és Költségbontás
              </span>
            </div>
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th>Cég Neve</th>
                  <th>Azonosító (Slug)</th>
                  <th>Csomag</th>
                  <th>Hívás Időtartam</th>
                  <th>Hívások Száma</th>
                  <th>Interakciók</th>
                  <th>Becsült Költség ($)</th>
                </tr>
              </thead>
              <tbody>
                {(financialsDetail?.companies || []).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td><code>{c.slug}</code></td>
                    <td><span className="mgmt-plan-badge">{c.plan}</span></td>
                    <td style={{ fontWeight: 600 }}>{c.call_minutes} perc</td>
                    <td>{c.calls_count} hívás</td>
                    <td>{c.interactions_count} db</td>
                    <td style={{ fontWeight: 800, color: 'var(--figma-accent3, #14b8ad)', fontSize: '14px' }}>
                      ${c.cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing reference */}
          <div className="mgmt-bento-card">
            <div className="mgmt-bento-header">
              <span className="mgmt-bento-title">Díjszabási és Elszámolási Referencia</span>
              <span className="mgmt-bento-tag">ThinkAI API Rate Card</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '13px' }}>
              <div className="mgmt-subbox-item" style={{ padding: '12px' }}>
                <span className="mgmt-subbox-item-label">Google Gemini 2.5 Flash Input</span>
                <strong style={{ fontSize: '16px' }}>$0.075 / 1M token</strong>
              </div>
              <div className="mgmt-subbox-item" style={{ padding: '12px' }}>
                <span className="mgmt-subbox-item-label">Google Gemini 2.5 Flash Output</span>
                <strong style={{ fontSize: '16px' }}>$0.300 / 1M token</strong>
              </div>
              <div className="mgmt-subbox-item" style={{ padding: '12px' }}>
                <span className="mgmt-subbox-item-label">Cartesia Sonic TTS Szintézis</span>
                <strong style={{ fontSize: '16px' }}>$0.075 / 10k karakter</strong>
              </div>
              <div className="mgmt-subbox-item" style={{ padding: '12px' }}>
                <span className="mgmt-subbox-item-label">Soniox Real-time STT</span>
                <strong style={{ fontSize: '16px' }}>$0.0017 / perc ($0.10/óra)</strong>
              </div>
              <div className="mgmt-subbox-item" style={{ padding: '12px' }}>
                <span className="mgmt-subbox-item-label">Telnyx SIP Telephony</span>
                <strong style={{ fontSize: '16px' }}>$0.0050 / perc</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          TAB 6: RENDSZER & WORKEREK
          ═══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'workers' && (
        <div>
          {/* System metadata banner */}
          <div className="mgmt-system-banner">
            <div>
              <div className="mgmt-detail-item-label">Rendszer Uptime</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>
                {Math.floor((systemInfo.uptime_seconds || 0) / 3600)}ó {Math.floor(((systemInfo.uptime_seconds || 0) % 3600) / 60)}p
              </div>
            </div>
            <div>
              <div className="mgmt-detail-item-label">Környezet</div>
              <div style={{ fontSize: '16px', fontWeight: 600, textTransform: 'capitalize' }}>
                {systemInfo.app_env || 'production'}
              </div>
            </div>
            <div>
              <div className="mgmt-detail-item-label">Python / OS</div>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                {systemInfo.python_version} ({systemInfo.os})
              </div>
            </div>
            <div>
              <div className="mgmt-detail-item-label">Agent Név</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>
                {systemInfo.agent_name || 'dobozos-ai'}
              </div>
            </div>
          </div>

          {/* Workers list */}
          <div className="mgmt-workers-grid">
            {workers.map((w) => (
              <div key={w.id} className="mgmt-worker-card">
                <div className="mgmt-worker-top">
                  <div className="mgmt-worker-title">{w.name}</div>
                  <span className={`mgmt-worker-status-pill ${w.status}`}>
                    {w.status === 'running' ? 'Aktív' : w.status === 'active' ? 'Csatlakozva' : 'Kikapcsolva (Staging)'}
                  </span>
                </div>
                <p className="mgmt-worker-desc">{w.description}</p>
                <div className="mgmt-worker-meta">
                  <span>Típus: {w.type}</span>
                  <span>Ciklus: {w.interval}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit User Modal (Company & Role reassignment) */}
      {editingUser && (
        <div className="mgmt-modal-backdrop" onClick={() => !editSaving && setEditingUser(null)}>
          <div className="mgmt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mgmt-modal-header">
              <div className="mgmt-modal-title-box">
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(20, 184, 173, 0.15)',
                  color: 'var(--figma-accent3, #14b8ad)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
                <div>
                  <h3 className="mgmt-modal-title">Felhasználó Hozzárendelése & Jogosultság</h3>
                  <p className="mgmt-modal-sub">Cég és szerepkör azonnali módosítása</p>
                </div>
              </div>
              <button
                className="mgmt-modal-close-btn"
                onClick={() => !editSaving && setEditingUser(null)}
                disabled={editSaving}
                title="Bezárás"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mgmt-modal-body">
              {/* User summary banner */}
              <div className="mgmt-modal-user-banner">
                <div className="mgmt-modal-user-avatar">
                  {(editingUser.full_name || editingUser.username || 'U')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                    {editingUser.full_name || editingUser.username}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    @{editingUser.username} {editingUser.email && `• ${editingUser.email}`}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Jelenleg: <strong>{editingUser.tenant_name}</strong> ({editingUser.role})
                  </div>
                </div>
              </div>

              {editError && (
                <div className="mgmt-modal-error">
                  {editError}
                </div>
              )}

              {/* Form group: Assigned Company */}
              <div className="mgmt-form-group">
                <label className="mgmt-form-label">Hozzárendelt Cég (Tenant)</label>
                <select
                  className="mgmt-form-select"
                  value={editTenantId}
                  onChange={(e) => setEditTenantId(e.target.value)}
                  disabled={editSaving}
                >
                  <option value="">Központi Rendszer (Globális / thinkai)</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
                <span className="mgmt-form-hint">
                  A felhasználó ehhez a céghez fog tartozni és ennek az adatait látja/kezeli a bejelentkezés után.
                </span>
              </div>

              {/* Form group: Role */}
              <div className="mgmt-form-group">
                <label className="mgmt-form-label">Szerepkör & Jogosultság</label>
                <select
                  className="mgmt-form-select"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={editSaving}
                >
                  <option value="superadmin">SUPERADMIN - Teljes körű globális hozzáférés minden céghez és beállításhoz</option>
                  <option value="admin">ADMIN - Céges adminisztrátor (hívások, beállítások, statisztikák)</option>
                  <option value="manager">MANAGER - Csoportvezető / menedzser (statisztikák, híváslisták)</option>
                  <option value="member">MEMBER - Alap felhasználó / recepció (alap nézetek)</option>
                </select>
                <span className="mgmt-form-hint">
                  A szerepkör határozza meg a menüpontokhoz és műveletekhez való hozzáférést.
                </span>
              </div>
            </div>

            <div className="mgmt-modal-footer">
              <button
                type="button"
                className="mgmt-btn"
                onClick={() => setEditingUser(null)}
                disabled={editSaving}
              >
                Mégse
              </button>
              <button
                type="button"
                className="mgmt-btn mgmt-btn-primary"
                onClick={handleSaveUser}
                disabled={editSaving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {editSaving ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mgmt-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10" />
                    </svg>
                    Mentés folyamatban...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Módosítások mentése
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Tenant Modal */}
      {showCreateTenantModal && (
        <div className="mgmt-modal-backdrop" onClick={() => !createTenantSaving && setShowCreateTenantModal(false)}>
          <div className="mgmt-modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateTenant}>
              <div className="mgmt-modal-header">
                <div className="mgmt-modal-title-box">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(20, 184, 173, 0.15)',
                    color: 'var(--figma-accent3, #14b8ad)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="mgmt-modal-title">Új Cég (Tenant) Regisztrációja</h3>
                    <p className="mgmt-modal-sub">Multi-tenant munkaterület és konfigurációk létrehozása</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="mgmt-modal-close-btn"
                  onClick={() => !createTenantSaving && setShowCreateTenantModal(false)}
                  disabled={createTenantSaving}
                  title="Bezárás"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="mgmt-modal-body">
                {createTenantError && (
                  <div className="mgmt-modal-error">
                    {createTenantError}
                  </div>
                )}

                {/* Name & Slug row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="mgmt-form-group">
                    <label className="mgmt-form-label">Cég Neve *</label>
                    <input
                      type="text"
                      className="mgmt-form-input"
                      placeholder="pl. Dentors Szeged"
                      value={newTenantName}
                      onChange={(e) => handleNameChangeForNewTenant(e.target.value)}
                      required
                      disabled={createTenantSaving}
                    />
                    <span className="mgmt-form-hint">Megjelenő hivatalos cégnév.</span>
                  </div>

                  <div className="mgmt-form-group">
                    <label className="mgmt-form-label">Azonosító (Slug) *</label>
                    <input
                      type="text"
                      className="mgmt-form-input"
                      placeholder="pl. dentors"
                      value={newTenantSlug}
                      onChange={(e) => setNewTenantSlug(slugify(e.target.value))}
                      required
                      disabled={createTenantSaving}
                    />
                    <span className="mgmt-form-hint">Egyedi URL azonosító (kisbetűk, kötőjel).</span>
                  </div>
                </div>

                {/* Plan select */}
                <div className="mgmt-form-group">
                  <label className="mgmt-form-label">Előfizetési Csomag</label>
                  <select
                    className="mgmt-form-select"
                    value={newTenantPlan}
                    onChange={(e) => setNewTenantPlan(e.target.value)}
                    disabled={createTenantSaving}
                  >
                    <option value="pro">PRO - Teljes hozzáférés (Voice + E-mail + Naptár + Analitika)</option>
                    <option value="enterprise">ENTERPRISE - Korlátlan bérlői keret és egyedi funkciók</option>
                    <option value="trial">TRIAL - Próbaidőszak</option>
                  </select>
                </div>

                {/* Seed defaults checkbox */}
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--bg3, #f0f1f3)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <input
                    type="checkbox"
                    id="seed-defaults-chk"
                    checked={newTenantSeedDefaults}
                    onChange={(e) => setNewTenantSeedDefaults(e.target.checked)}
                    disabled={createTenantSaving}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="seed-defaults-chk" style={{ fontSize: '12px', cursor: 'pointer', userSelect: 'none' }}>
                    <strong>Alapértelmezett beállítások inicializálása</strong> (Kanban oszlopok, AI köszöntés, naptár beállítások és döntési szabályok seedelése)
                  </label>
                </div>

                {/* Initial Admin User toggle section */}
                <div style={{
                  border: '1px solid var(--border, #e2e4e8)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        Kezdő céges adminisztrátor létrehozása
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Opcionális — a céges adminisztrátor azonnal be tud lépni ezekkel az adatokkal.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={newTenantCreateAdmin}
                      onChange={(e) => setNewTenantCreateAdmin(e.target.checked)}
                      disabled={createTenantSaving}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </div>

                  {newTenantCreateAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px', paddingTop: '10px', borderTop: '1px dashed var(--border, #e2e4e8)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="mgmt-form-group">
                          <label className="mgmt-form-label">Admin Felhasználónév *</label>
                          <input
                            type="text"
                            className="mgmt-form-input"
                            placeholder="pl. dentors_admin"
                            value={newTenantAdminUsername}
                            onChange={(e) => setNewTenantAdminUsername(e.target.value)}
                            required={newTenantCreateAdmin}
                            disabled={createTenantSaving}
                          />
                        </div>
                        <div className="mgmt-form-group">
                          <label className="mgmt-form-label">Kezdő Jelszó *</label>
                          <input
                            type="password"
                            className="mgmt-form-input"
                            placeholder="Min. 6 karakter"
                            value={newTenantAdminPassword}
                            onChange={(e) => setNewTenantAdminPassword(e.target.value)}
                            required={newTenantCreateAdmin}
                            disabled={createTenantSaving}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="mgmt-form-group">
                          <label className="mgmt-form-label">Teljes Név</label>
                          <input
                            type="text"
                            className="mgmt-form-input"
                            placeholder="pl. Dr. Kiss Péter"
                            value={newTenantAdminFullName}
                            onChange={(e) => setNewTenantAdminFullName(e.target.value)}
                            disabled={createTenantSaving}
                          />
                        </div>
                        <div className="mgmt-form-group">
                          <label className="mgmt-form-label">Email Cím</label>
                          <input
                            type="email"
                            className="mgmt-form-input"
                            placeholder="pl. admin@dentors.hu"
                            value={newTenantAdminEmail}
                            onChange={(e) => setNewTenantAdminEmail(e.target.value)}
                            disabled={createTenantSaving}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mgmt-modal-footer">
                <button
                  type="button"
                  className="mgmt-btn"
                  onClick={() => setShowCreateTenantModal(false)}
                  disabled={createTenantSaving}
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="mgmt-btn mgmt-btn-primary"
                  disabled={createTenantSaving}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {createTenantSaving ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mgmt-spin">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10" />
                      </svg>
                      Létrehozás folyamatban...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Cég Létrehozása
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Törlés Megerősítő Modális Dialógus ── */}
      {deletingTenant && (
        <div className="mgmt-modal-backdrop" onClick={() => !deleteTenantSaving && setDeletingTenant(null)}>
          <div
            className="mgmt-modal-card"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mgmt-modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--red, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <h3 className="mgmt-modal-title" style={{ color: 'var(--red, #ef4444)', margin: 0 }}>
                  Cég Végleges Törlése
                </h3>
              </div>
              <button
                type="button"
                className="mgmt-modal-close"
                onClick={() => !deleteTenantSaving && setDeletingTenant(null)}
                disabled={deleteTenantSaving}
              >
                ✕
              </button>
            </div>

            <div className="mgmt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {deleteTenantError && (
                <div className="mgmt-modal-error">
                  {deleteTenantError}
                </div>
              )}

              <div className="mgmt-danger-box">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text)' }}>
                  Biztosan véglegesen törölni szeretnéd a(z) <strong style={{ color: 'var(--red, #ef4444)' }}>{deletingTenant.name}</strong> (<code>{deletingTenant.slug}</code>) bérlői céget?
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0 4px' }}>
                Ez a művelet <strong>visszavonhatatlan</strong>. A céghez kapcsolódó összes konfiguráció (üzleti profil, AI beállítások, CRM adatok, ügyfélnévsor, Kanban oszlopok és bérlői admin felhasználók) véglegesen törlésre kerül az adatbázisból.
              </div>
            </div>

            <div className="mgmt-modal-footer">
              <button
                type="button"
                className="mgmt-btn"
                onClick={() => setDeletingTenant(null)}
                disabled={deleteTenantSaving}
              >
                Mégse
              </button>
              <button
                type="button"
                className="mgmt-btn mgmt-btn-danger"
                onClick={handleDeleteTenantConfirm}
                disabled={deleteTenantSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {deleteTenantSaving ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mgmt-spin">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10" />
                    </svg>
                    Törlés folyamatban...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Végleges Törlés
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
