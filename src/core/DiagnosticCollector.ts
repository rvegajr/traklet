/**
 * DiagnosticCollector - Gathers environment and diagnostic info for bug reports
 *
 * This runs in the browser WITHOUT the Chrome extension, providing basic
 * diagnostic information when users submit issues through the widget.
 *
 * Supports "recording sessions" where users can click "Start Report" to begin
 * capturing their journey, navigate through multiple pages, then click "Stop"
 * to submit with full context. Data persists in sessionStorage across navigations.
 */

const SESSION_STORAGE_KEY = '__traklet_recording_session__';

export interface EnvironmentInfo {
  readonly url: string;
  readonly origin: string;
  readonly pathname: string;
  readonly userAgent: string;
  readonly platform: string;
  readonly language: string;
  readonly timezone: string;
  readonly online: boolean;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly screen: {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
  };
  readonly timestamp: string;
}

export interface PerformanceInfo {
  readonly pageLoadTime: number | null;
  readonly domContentLoaded: number | null;
  readonly firstContentfulPaint: number | null;
  readonly memoryUsage: number | null;
  readonly resourceCount: number;
}

export interface ConsoleEntry {
  readonly level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  readonly message: string;
  readonly timestamp: string;
  readonly url?: string;
}

export interface JSError {
  readonly message: string;
  readonly filename: string;
  readonly lineno: number;
  readonly colno: number;
  readonly stack: string | null;
  readonly timestamp: string;
  readonly url?: string;
}

export interface UserAction {
  readonly type: 'click' | 'navigation' | 'input' | 'scroll' | 'submit';
  readonly target: string;
  readonly url: string;
  readonly timestamp: string;
  readonly details?: string | undefined;
}

export interface PageVisit {
  readonly url: string;
  readonly title: string;
  readonly timestamp: string;
  readonly duration?: number;
}

export interface RecordingSession {
  readonly id: string;
  readonly startedAt: string;
  endedAt?: string;
  readonly pages: PageVisit[];
  readonly actions: UserAction[];
  readonly consoleLogs: ConsoleEntry[];
  readonly jsErrors: JSError[];
  readonly isActive: boolean;
}

export interface DiagnosticData {
  readonly environment: EnvironmentInfo;
  readonly performance: PerformanceInfo;
  readonly consoleLogs: readonly ConsoleEntry[];
  readonly jsErrors: readonly JSError[];
  readonly userActions: readonly UserAction[];
  readonly session?: RecordingSession | undefined;
  readonly collectedAt: string;
}

export interface DiagnosticCollectorConfig {
  /** Max console entries to keep (default: 50) */
  maxConsoleLogs?: number;
  /** Max JS errors to keep (default: 20) */
  maxJsErrors?: number;
  /** Max user actions to keep (default: 100) */
  maxUserActions?: number;
  /** Capture console logs (default: true) */
  captureConsole?: boolean;
  /** Capture JS errors (default: true) */
  captureErrors?: boolean;
  /** Capture user actions like clicks (default: true) */
  captureUserActions?: boolean;
  /** Persist recording sessions across page navigations (default: true) */
  persistSession?: boolean;
}

const DEFAULT_CONFIG: Required<DiagnosticCollectorConfig> = {
  maxConsoleLogs: 50,
  maxJsErrors: 20,
  maxUserActions: 100,
  captureConsole: true,
  captureErrors: true,
  captureUserActions: true,
  persistSession: true,
};

export class DiagnosticCollector {
  private consoleLogs: ConsoleEntry[] = [];
  private jsErrors: JSError[] = [];
  private userActions: UserAction[] = [];
  private config: Required<DiagnosticCollectorConfig>;
  private initialized = false;
  private originalConsole: Record<string, (...args: unknown[]) => void> = {};
  private currentSession: RecordingSession | null = null;
  private pageEnteredAt: number = Date.now();

  // Stored listener references for proper cleanup (MANDATE 7 compliance)
  private errorListener: ((event: ErrorEvent) => void) | null = null;
  private rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;
  private clickListener: ((event: Event) => void) | null = null;
  private submitListener: ((event: Event) => void) | null = null;
  private visibilityListener: (() => void) | null = null;
  private popstateListener: (() => void) | null = null;

  constructor(config: DiagnosticCollectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the collector - starts capturing console logs and errors
   */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return;

    if (this.config.captureConsole) {
      this.interceptConsole();
    }

    if (this.config.captureErrors) {
      this.interceptErrors();
    }

    if (this.config.captureUserActions) {
      this.interceptUserActions();
    }

    // Restore any active session from storage
    if (this.config.persistSession) {
      this.restoreSession();
    }

    this.pageEnteredAt = Date.now();
    this.initialized = true;
  }

  /**
   * Stop collecting and restore original console
   */
  destroy(): void {
    if (!this.initialized) return;

    // Restore original console methods
    if (this.config.captureConsole) {
      for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
        const original = this.originalConsole[level];
        if (original) {
          (console as unknown as Record<string, unknown>)[level] = original;
        }
      }
    }

    // Remove all global event listeners (MANDATE 7 compliance)
    if (this.errorListener) {
      window.removeEventListener('error', this.errorListener);
      this.errorListener = null;
    }
    if (this.rejectionListener) {
      window.removeEventListener('unhandledrejection', this.rejectionListener);
      this.rejectionListener = null;
    }
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener, { capture: true });
      this.clickListener = null;
    }
    if (this.submitListener) {
      document.removeEventListener('submit', this.submitListener, { capture: true });
      this.submitListener = null;
    }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    if (this.popstateListener) {
      window.removeEventListener('popstate', this.popstateListener);
      this.popstateListener = null;
    }

    this.initialized = false;
  }

  // ============================================
  // Recording Session Methods
  // ============================================

  /**
   * Start a new recording session
   * User clicks "Start Report" to begin capturing their journey
   */
  startRecording(): RecordingSession {
    const session: RecordingSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      pages: [],
      actions: [],
      consoleLogs: [],
      jsErrors: [],
      isActive: true,
    };

    // Add current page as first visit
    session.pages.push({
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
    });

    this.currentSession = session;
    this.persistSessionToStorage();

    return session;
  }

  /**
   * Stop the current recording session
   * User clicks "Stop" to finalize and prepare for submission
   */
  stopRecording(): RecordingSession | null {
    if (!this.currentSession) return null;

    // Update duration for last page
    const lastPage = this.currentSession.pages[this.currentSession.pages.length - 1];
    if (lastPage && !lastPage.duration) {
      const pages = [...this.currentSession.pages];
      pages[pages.length - 1] = {
        ...lastPage,
        duration: Date.now() - new Date(lastPage.timestamp).getTime(),
      };
      this.currentSession = { ...this.currentSession, pages };
    }

    this.currentSession.endedAt = new Date().toISOString();
    (this.currentSession as { isActive: boolean }).isActive = false;

    const session = this.currentSession;
    this.clearSessionStorage();

    return session;
  }

  /**
   * Cancel the current recording without saving
   */
  cancelRecording(): void {
    this.currentSession = null;
    this.clearSessionStorage();
  }

  /**
   * Check if a recording session is active
   */
  isRecording(): boolean {
    return this.currentSession?.isActive ?? false;
  }

  /**
   * Get the current recording session
   */
  getRecordingSession(): RecordingSession | null {
    return this.currentSession;
  }

  // ============================================
  // Data Collection Methods
  // ============================================

  /**
   * Get current environment information
   */
  getEnvironment(): EnvironmentInfo {
    if (typeof window === 'undefined') {
      return this.getEmptyEnvironment();
    }

    return {
      url: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: navigator.onLine,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: screen.width,
        height: screen.height,
        pixelRatio: window.devicePixelRatio,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get performance metrics
   */
  getPerformance(): PerformanceInfo {
    if (typeof window === 'undefined' || !window.performance) {
      return this.getEmptyPerformance();
    }

    const timing = performance.timing;
    const entries = performance.getEntriesByType('paint');
    const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');

    let memoryUsage: number | null = null;
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
      memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    }

    return {
      pageLoadTime: timing.loadEventEnd > 0
        ? timing.loadEventEnd - timing.navigationStart
        : null,
      domContentLoaded: timing.domContentLoadedEventEnd > 0
        ? timing.domContentLoadedEventEnd - timing.navigationStart
        : null,
      firstContentfulPaint: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      memoryUsage,
      resourceCount: performance.getEntriesByType('resource').length,
    };
  }

  /**
   * Get collected console logs
   */
  getConsoleLogs(): readonly ConsoleEntry[] {
    return [...this.consoleLogs];
  }

  /**
   * Get collected JS errors
   */
  getJsErrors(): readonly JSError[] {
    return [...this.jsErrors];
  }

  /**
   * Get collected user actions
   */
  getUserActions(): readonly UserAction[] {
    return [...this.userActions];
  }

  /**
   * Get all diagnostic data
   */
  collect(): DiagnosticData {
    return {
      environment: this.getEnvironment(),
      performance: this.getPerformance(),
      consoleLogs: this.getConsoleLogs(),
      jsErrors: this.getJsErrors(),
      userActions: this.getUserActions(),
      session: this.currentSession ?? undefined,
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Format diagnostic data as markdown for issue body
   */
  formatAsMarkdown(): string {
    const data = this.collect();
    const lines: string[] = [];

    // Session Journey section (if recording)
    if (data.session && data.session.pages.length > 0) {
      lines.push('## User Journey');
      lines.push(`*Recording started at ${data.session.startedAt}*`);
      lines.push('');
      lines.push('### Pages Visited');
      for (let i = 0; i < data.session.pages.length; i++) {
        const page = data.session.pages[i];
        if (page) {
          const duration = page.duration ? ` (${Math.round(page.duration / 1000)}s)` : '';
          lines.push(`${i + 1}. **${page.title || 'Untitled'}**${duration}`);
          lines.push(`   ${page.url}`);
        }
      }
      lines.push('');

      if (data.session.actions.length > 0) {
        lines.push('### User Actions');
        const recentActions = data.session.actions.slice(-10);
        for (const action of recentActions) {
          const time = new Date(action.timestamp).toLocaleTimeString();
          lines.push(`- \`${time}\` ${action.type}: ${action.target}${action.details ? ` - ${action.details}` : ''}`);
        }
        if (data.session.actions.length > 10) {
          lines.push(`- ... and ${data.session.actions.length - 10} earlier actions`);
        }
        lines.push('');
      }
    }

    // Environment section
    lines.push('## Environment');
    lines.push(`- **URL:** ${data.environment.url}`);
    lines.push(`- **Browser:** ${this.getBrowserName(data.environment.userAgent)}`);
    lines.push(`- **Viewport:** ${data.environment.viewport.width}x${data.environment.viewport.height}`);
    lines.push(`- **Screen:** ${data.environment.screen.width}x${data.environment.screen.height} @${data.environment.screen.pixelRatio}x`);
    lines.push(`- **Platform:** ${data.environment.platform}`);
    lines.push(`- **Timezone:** ${data.environment.timezone}`);
    lines.push(`- **Online:** ${data.environment.online ? 'Yes' : 'No'}`);
    lines.push('');

    // Performance section
    if (data.performance.pageLoadTime !== null) {
      lines.push('## Performance');
      lines.push(`- **Page Load:** ${data.performance.pageLoadTime}ms`);
      if (data.performance.domContentLoaded !== null) {
        lines.push(`- **DOM Ready:** ${data.performance.domContentLoaded}ms`);
      }
      if (data.performance.firstContentfulPaint !== null) {
        lines.push(`- **First Paint:** ${data.performance.firstContentfulPaint}ms`);
      }
      if (data.performance.memoryUsage !== null) {
        lines.push(`- **Memory:** ${data.performance.memoryUsage}MB`);
      }
      lines.push(`- **Resources:** ${data.performance.resourceCount}`);
      lines.push('');
    }

    // JS Errors section (combine session + current page)
    const allErrors = data.session?.jsErrors.length
      ? [...data.session.jsErrors, ...data.jsErrors]
      : data.jsErrors;

    if (allErrors.length > 0) {
      lines.push('## JavaScript Errors');
      for (const error of allErrors.slice(0, 5)) {
        lines.push(`- \`${error.message}\` at ${error.filename}:${error.lineno}`);
      }
      if (allErrors.length > 5) {
        lines.push(`- ... and ${allErrors.length - 5} more`);
      }
      lines.push('');
    }

    // Console errors/warnings section (combine session + current page)
    const allLogs = data.session?.consoleLogs.length
      ? [...data.session.consoleLogs, ...data.consoleLogs]
      : data.consoleLogs;

    const errorLogs = allLogs.filter(l => l.level === 'error' || l.level === 'warn');
    if (errorLogs.length > 0) {
      lines.push('## Console Errors/Warnings');
      for (const log of errorLogs.slice(0, 5)) {
        const prefix = log.level === 'error' ? '🔴' : '🟡';
        lines.push(`- ${prefix} ${log.message.slice(0, 100)}${log.message.length > 100 ? '...' : ''}`);
      }
      if (errorLogs.length > 5) {
        lines.push(`- ... and ${errorLogs.length - 5} more`);
      }
      lines.push('');
    }

    lines.push(`---`);
    lines.push(`*Collected at ${data.collectedAt}*`);

    return lines.join('\n');
  }

  /**
   * Clear all collected data
   */
  clear(): void {
    this.consoleLogs = [];
    this.jsErrors = [];
    this.userActions = [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private interceptConsole(): void {
    const levels = ['log', 'warn', 'error', 'info', 'debug'] as const;

    for (const level of levels) {
      this.originalConsole[level] = console[level].bind(console);

      (console as unknown as Record<string, unknown>)[level] = (...args: unknown[]) => {
        // Call original
        const original = this.originalConsole[level];
        if (original) {
          original(...args);
        }

        // Store entry
        const entry: ConsoleEntry = {
          level,
          message: this.formatArgs(args),
          timestamp: new Date().toISOString(),
          url: window.location.href,
        };

        this.consoleLogs.push(entry);

        // Also add to active session
        if (this.currentSession?.isActive) {
          this.currentSession.consoleLogs.push(entry);
          this.persistSessionToStorage();
        }

        // Trim if over limit
        if (this.consoleLogs.length > this.config.maxConsoleLogs) {
          this.consoleLogs.shift();
        }
      };
    }
  }

  private interceptErrors(): void {
    // Use addEventListener instead of assigning window.onerror directly.
    // This avoids clobbering the host page's error handler (MANDATE 7).
    this.errorListener = (event: ErrorEvent) => {
      const entry: JSError = {
        message: String(event.message),
        filename: event.filename || 'unknown',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack: event.error?.stack || null,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      };

      this.jsErrors.push(entry);

      if (this.currentSession?.isActive) {
        this.currentSession.jsErrors.push(entry);
        this.persistSessionToStorage();
      }

      if (this.jsErrors.length > this.config.maxJsErrors) {
        this.jsErrors.shift();
      }
    };
    window.addEventListener('error', this.errorListener);

    this.rejectionListener = (event: PromiseRejectionEvent) => {
      const entry: JSError = {
        message: `Unhandled Promise Rejection: ${event.reason}`,
        filename: 'promise',
        lineno: 0,
        colno: 0,
        stack: event.reason?.stack || null,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      };

      this.jsErrors.push(entry);

      if (this.currentSession?.isActive) {
        this.currentSession.jsErrors.push(entry);
        this.persistSessionToStorage();
      }

      if (this.jsErrors.length > this.config.maxJsErrors) {
        this.jsErrors.shift();
      }
    };
    window.addEventListener('unhandledrejection', this.rejectionListener);
  }

  private interceptUserActions(): void {
    // Track clicks (store reference for cleanup)
    this.clickListener = (e: Event) => {
      const target = e.target as HTMLElement;
      const action: UserAction = {
        type: 'click',
        target: this.describeElement(target),
        url: window.location.href,
        timestamp: new Date().toISOString(),
        details: target.textContent?.slice(0, 50)?.trim() || undefined,
      };

      this.userActions.push(action);

      if (this.currentSession?.isActive) {
        this.currentSession.actions.push(action);
        this.persistSessionToStorage();
      }

      if (this.userActions.length > this.config.maxUserActions) {
        this.userActions.shift();
      }
    };
    document.addEventListener('click', this.clickListener, { passive: true, capture: true });

    // Track form submissions (store reference for cleanup)
    this.submitListener = (e: Event) => {
      const target = e.target as HTMLFormElement;
      const action: UserAction = {
        type: 'submit',
        target: this.describeElement(target),
        url: window.location.href,
        timestamp: new Date().toISOString(),
        details: target.action || undefined,
      };

      this.userActions.push(action);

      if (this.currentSession?.isActive) {
        this.currentSession.actions.push(action);
        this.persistSessionToStorage();
      }
    };
    document.addEventListener('submit', this.submitListener, { passive: true, capture: true });

    // Track page visibility changes (store reference for cleanup)
    this.visibilityListener = () => {
      if (document.visibilityState === 'hidden' && this.currentSession?.isActive) {
        const lastPage = this.currentSession.pages[this.currentSession.pages.length - 1];
        if (lastPage && lastPage.url === window.location.href && !lastPage.duration) {
          const pages = [...this.currentSession.pages];
          pages[pages.length - 1] = {
            ...lastPage,
            duration: Date.now() - this.pageEnteredAt,
          };
          this.currentSession = { ...this.currentSession, pages };
          this.persistSessionToStorage();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityListener);

    // Track popstate (store reference for cleanup)
    this.popstateListener = () => {
      if (this.currentSession?.isActive) {
        const action: UserAction = {
          type: 'navigation',
          target: 'browser back/forward',
          url: window.location.href,
          timestamp: new Date().toISOString(),
        };
        this.currentSession.actions.push(action);
        this.addPageToSession();
      }
    };
    window.addEventListener('popstate', this.popstateListener);
  }

  private addPageToSession(): void {
    if (!this.currentSession?.isActive) return;

    // Check if this is a new page
    const lastPage = this.currentSession.pages[this.currentSession.pages.length - 1];
    if (lastPage?.url !== window.location.href) {
      this.currentSession.pages.push({
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      });
      this.pageEnteredAt = Date.now();
      this.persistSessionToStorage();
    }
  }

  private persistSessionToStorage(): void {
    if (!this.config.persistSession || !this.currentSession) return;

    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.currentSession));
    } catch {
      // Storage might be full or disabled
    }
  }

  private restoreSession(): void {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as RecordingSession;
        if (session.isActive) {
          this.currentSession = session;

          // Record navigation to this page
          const action: UserAction = {
            type: 'navigation',
            target: 'page load',
            url: window.location.href,
            timestamp: new Date().toISOString(),
          };
          this.currentSession.actions.push(action);
          this.addPageToSession();
        }
      }
    } catch {
      // Invalid stored data
      this.clearSessionStorage();
    }
  }

  private clearSessionStorage(): void {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage might be disabled
    }
  }

  private describeElement(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.className && typeof el.className === 'string'
      ? '.' + el.className.split(' ').slice(0, 2).join('.')
      : '';
    const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
    const name = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '';

    return `${tag}${id}${classes}${role}${name}`.slice(0, 80);
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ')
      .slice(0, 500); // Limit message length
  }

  private getBrowserName(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getEmptyEnvironment(): EnvironmentInfo {
    return {
      url: '',
      origin: '',
      pathname: '',
      userAgent: '',
      platform: '',
      language: '',
      timezone: '',
      online: false,
      viewport: { width: 0, height: 0 },
      screen: { width: 0, height: 0, pixelRatio: 1 },
      timestamp: new Date().toISOString(),
    };
  }

  private getEmptyPerformance(): PerformanceInfo {
    return {
      pageLoadTime: null,
      domContentLoaded: null,
      firstContentfulPaint: null,
      memoryUsage: null,
      resourceCount: 0,
    };
  }
}

// Singleton instance for easy use
let defaultCollector: DiagnosticCollector | null = null;

export function getDiagnosticCollector(config?: DiagnosticCollectorConfig): DiagnosticCollector {
  if (!defaultCollector) {
    defaultCollector = new DiagnosticCollector(config);
  }
  return defaultCollector;
}

export function resetDiagnosticCollector(): void {
  if (defaultCollector) {
    defaultCollector.destroy();
    defaultCollector = null;
  }
}
