/**
 * EAISY Desk — Client-side Error Reporter & Observability
 * 
 * Features:
 * - Rate limiting: Max 10 errors / minute (prevents infinite loop DB flooding)
 * - Sensitive data sanitization: Passwords, tokens, authorization headers masked to [REDACTED]
 * - Fire-and-forget: Does not block the UI or fail visibly
 * - Global listeners: window.onerror, unhandledrejection
 */

interface ErrorContext {
  component?: string;
  action?: string;
  severity?: 'error' | 'warning' | 'info';
  error_type?: 'frontend' | 'auth' | 'api_call' | 'db_query' | 'validation' | 'navigation' | 'render' | 'unhandled';
  context?: Record<string, any>;
  tenant_id?: string;
  user_id?: string;
}

// Rate limiting: sliding 60-second window, max 10 errors
const MAX_ERRORS_PER_MINUTE = 10;
const errorTimestamps: number[] = [];

// Sensitive field names to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /auth_token/i,
  /api_?key/i,
  /credit_?card/i,
  /cvv/i,
  /jwt/i,
];

function sanitizeValue(key: string, value: any): any {
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))) {
    return '[REDACTED]';
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
}

export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => (typeof item === 'object' ? sanitizeObject(item) : item));
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = sanitizeValue(k, v);
  }
  return clean;
}

function isRateLimited(): boolean {
  const now = Date.now();
  // Filter out timestamps older than 60 seconds
  const recent = errorTimestamps.filter((t) => now - t < 60000);
  errorTimestamps.length = 0;
  errorTimestamps.push(...recent);

  if (errorTimestamps.length >= MAX_ERRORS_PER_MINUTE) {
    return true;
  }
  errorTimestamps.push(now);
  return false;
}

/**
 * Main function to report errors to the backend
 */
export async function reportError(
  error: Error | string | unknown,
  options: ErrorContext = {}
): Promise<void> {
  try {
    if (isRateLimited()) {
      console.warn('[ErrorReporter] Rate limit exceeded (10 errors/min). Suppressing report.');
      return;
    }

    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
    const stack_trace = error instanceof Error ? error.stack : undefined;

    let user_id: string | undefined = options.user_id;
    let tenant_id: string | undefined = options.tenant_id;

    // Try reading active user/tenant from storage if not explicitly provided
    if (!user_id || !tenant_id) {
      try {
        const rawUser = localStorage.getItem('sb_admin_user');
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (!user_id) user_id = u.username || u.email;
          if (!tenant_id) tenant_id = u.tenantId;
        }
      } catch {
        // ignore
      }
    }

    const payload = {
      message,
      stack_trace,
      error_type: options.error_type || 'frontend',
      severity: options.severity || 'error',
      component: options.component,
      action: options.action,
      context: sanitizeObject(options.context || {}),
      url: window.location.pathname + window.location.search,
      user_agent: navigator.userAgent,
      tenant_id,
      user_id,
    };

    // Fire and forget
    fetch('/admin/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fallback: silently ignore network errors to avoid cascading failure
    });
  } catch (err) {
    console.error('[ErrorReporter] Failed to send error report:', err);
  }
}

export function reportAuthError(error: unknown, context: Record<string, any> = {}) {
  return reportError(error, { error_type: 'auth', severity: 'error', component: 'Auth', context });
}

export function reportApiError(endpoint: string, status: number, detail: any) {
  return reportError(`API Error ${status} on ${endpoint}`, {
    error_type: 'api_call',
    severity: status >= 500 ? 'error' : 'warning',
    component: 'ApiClient',
    context: { endpoint, status, detail },
  });
}

export function reportDbError(error: unknown, action: string, context: Record<string, any> = {}) {
  return reportError(error, {
    error_type: 'db_query',
    severity: 'error',
    component: 'Database',
    action,
    context,
  });
}

/**
 * Initializes global uncaught error and unhandled promise listeners
 */
let isGlobalHandlingInitialized = false;

export function initGlobalErrorHandling() {
  if (isGlobalHandlingInitialized || typeof window === 'undefined') return;
  isGlobalHandlingInitialized = true;

  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, {
      error_type: 'unhandled',
      severity: 'error',
      component: 'window.onerror',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason || 'Unhandled Promise Rejection', {
      error_type: 'unhandled',
      severity: 'error',
      component: 'unhandledrejection',
    });
  });
}
