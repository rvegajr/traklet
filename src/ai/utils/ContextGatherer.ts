/**
 * Context Gatherer
 * 
 * Automatically captures browser, console, network, and performance context
 * when QA is reporting an issue. Provides rich data to AI for better issue generation.
 */

import type { BrowserContext, ConsoleEntry, NetworkRequest } from '../services/LLMProvider';

export interface ContextGathererConfig {
  captureConsole: boolean;
  captureNetwork: boolean;
  capturePerformance: boolean;
  captureLocalStorage: boolean;
  maxConsoleEntries: number;
  maxNetworkRequests: number;
  networkSlowThreshold: number; // ms
}

export class ContextGatherer {
  private config: ContextGathererConfig;
  private consoleBuffer: ConsoleEntry[] = [];
  private networkBuffer: NetworkRequest[] = [];
  private startTime: number;

  constructor(config?: Partial<ContextGathererConfig>) {
    this.config = {
      captureConsole: true,
      captureNetwork: true,
      capturePerformance: true,
      captureLocalStorage: true,
      maxConsoleEntries: 50,
      maxNetworkRequests: 30,
      networkSlowThreshold: 3000, // 3 seconds
      ...config,
    };

    this.startTime = Date.now();
    this.setupListeners();
  }

  /**
   * Gather all available context
   */
  async gatherContext(): Promise<BrowserContext> {
    const context: BrowserContext = {
      browser: this.getBrowserInfo(),
      page: this.getPageInfo(),
      console: this.getConsoleInfo(),
      network: this.getNetworkInfo(),
      performance: await this.getPerformanceInfo(),
      localStorage: this.getLocalStorageInfo(),
    };

    return context;
  }

  /**
   * Get browser information
   */
  private getBrowserInfo() {
    const ua = navigator.userAgent;
    const browser = this.parseBrowser(ua);

    return {
      userAgent: ua,
      name: browser.name,
      version: browser.version,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      platform: navigator.platform,
    };
  }

  /**
   * Parse browser name and version from user agent
   */
  private parseBrowser(ua: string): { name: string; version: string } {
    // Chrome
    if (ua.includes('Chrome/') && !ua.includes('Edg')) {
      const match = ua.match(/Chrome\/([\d.]+)/);
      return { name: 'Chrome', version: match?.[1] || 'Unknown' };
    }

    // Edge
    if (ua.includes('Edg/')) {
      const match = ua.match(/Edg\/([\d.]+)/);
      return { name: 'Edge', version: match?.[1] || 'Unknown' };
    }

    // Firefox
    if (ua.includes('Firefox/')) {
      const match = ua.match(/Firefox\/([\d.]+)/);
      return { name: 'Firefox', version: match?.[1] || 'Unknown' };
    }

    // Safari
    if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/([\d.]+)/);
      return { name: 'Safari', version: match?.[1] || 'Unknown' };
    }

    return { name: 'Unknown', version: 'Unknown' };
  }

  /**
   * Get page information
   */
  private getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date(),
      referrer: document.referrer || undefined,
    };
  }

  /**
   * Get console information
   */
  private getConsoleInfo() {
    const errors = this.consoleBuffer.filter(e => e.level === 'error');
    const warnings = this.consoleBuffer.filter(e => e.level === 'warn');
    const logs = this.consoleBuffer.filter(e => e.level === 'log' || e.level === 'info');

    return {
      errors: errors.slice(-this.config.maxConsoleEntries),
      warnings: warnings.slice(-this.config.maxConsoleEntries),
      logs: logs.slice(-this.config.maxConsoleEntries),
    };
  }

  /**
   * Get network information
   */
  private getNetworkInfo() {
    const failed = this.networkBuffer.filter(r => r.failed);
    const slow = this.networkBuffer.filter(
      r => !r.failed && r.duration > this.config.networkSlowThreshold
    );

    return {
      failedRequests: failed.slice(-this.config.maxNetworkRequests),
      slowRequests: slow.slice(-this.config.maxNetworkRequests),
      totalRequests: this.networkBuffer.length,
    };
  }

  /**
   * Get performance information
   */
  private async getPerformanceInfo() {
    const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    const loadTime = perfData ? perfData.loadEventEnd - perfData.fetchStart : 0;
    const domContentLoaded = perfData ? perfData.domContentLoadedEventEnd - perfData.fetchStart : 0;

    // Memory (if available)
    let memoryUsage: number | undefined;
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024); // MB
    }

    return {
      loadTime: Math.round(loadTime),
      domContentLoaded: Math.round(domContentLoaded),
      memoryUsage,
    };
  }

  /**
   * Get localStorage information (keys only, never values for privacy)
   */
  private getLocalStorageInfo() {
    if (!this.config.captureLocalStorage) {
      return { keyCount: 0, keys: [] };
    }

    try {
      const keys = Object.keys(localStorage);
      return {
        keyCount: keys.length,
        keys: keys.filter(k => !this.isSensitiveKey(k)), // Filter sensitive keys
      };
    } catch (error) {
      // localStorage might be disabled
      return { keyCount: 0, keys: [] };
    }
  }

  /**
   * Check if localStorage key is sensitive (don't expose)
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /token/i,
      /auth/i,
      /session/i,
      /password/i,
      /secret/i,
      /key/i,
      /api/i,
    ];

    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  /**
   * Setup console and network listeners
   */
  private setupListeners() {
    if (this.config.captureConsole) {
      this.interceptConsole();
    }

    if (this.config.captureNetwork) {
      this.interceptNetwork();
    }
  }

  /**
   * Intercept console methods to capture errors/warnings
   */
  private interceptConsole() {
    const originalConsole = {
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      log: console.log.bind(console),
      info: console.info.bind(console),
    };

    // Intercept console.error
    console.error = (...args: any[]) => {
      this.addConsoleEntry('error', args);
      originalConsole.error(...args);
    };

    // Intercept console.warn
    console.warn = (...args: any[]) => {
      this.addConsoleEntry('warn', args);
      originalConsole.warn(...args);
    };

    // Intercept console.log
    console.log = (...args: any[]) => {
      this.addConsoleEntry('log', args);
      originalConsole.log(...args);
    };

    // Intercept console.info
    console.info = (...args: any[]) => {
      this.addConsoleEntry('info', args);
      originalConsole.info(...args);
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.addConsoleEntry('error', [event.message], event.error?.stack);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addConsoleEntry('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    });
  }

  /**
   * Add console entry to buffer
   */
  private addConsoleEntry(level: ConsoleEntry['level'], args: any[], stack?: string) {
    const message = args
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    // Don't capture Traklet's own logs
    if (message.includes('[Traklet]') || message.includes('[ClaudeProvider]')) {
      return;
    }

    this.consoleBuffer.push({
      level,
      message: this.sanitizeMessage(message),
      timestamp: new Date(),
      stack: stack ? this.sanitizeStackTrace(stack) : undefined,
    });

    // Keep buffer size manageable
    if (this.consoleBuffer.length > this.config.maxConsoleEntries * 2) {
      this.consoleBuffer = this.consoleBuffer.slice(-this.config.maxConsoleEntries);
    }
  }

  /**
   * Sanitize console message (remove sensitive data)
   */
  private sanitizeMessage(message: string): string {
    // Redact tokens, API keys, passwords
    let sanitized = message.replace(/([a-zA-Z0-9]{20,})/g, (match) => {
      // If it looks like a token/key, redact it
      if (/^[a-zA-Z0-9_-]{20,}$/.test(match)) {
        return '[REDACTED_TOKEN]';
      }
      return match;
    });

    // Redact email addresses
    sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[REDACTED_EMAIL]');

    // Redact phone numbers
    sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');

    return sanitized;
  }

  /**
   * Sanitize stack trace
   */
  private sanitizeStackTrace(stack: string): string {
    // Keep only first 5 lines of stack trace
    const lines = stack.split('\n').slice(0, 5);
    return lines.join('\n');
  }

  /**
   * Intercept fetch and XMLHttpRequest for network monitoring
   */
  private interceptNetwork() {
    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const startTime = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;

        this.addNetworkRequest({
          url,
          method: args[1]?.method || 'GET',
          status: response.status,
          duration,
          failed: !response.ok,
          errorMessage: response.ok ? undefined : response.statusText,
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.addNetworkRequest({
          url,
          method: args[1]?.method || 'GET',
          status: 0,
          duration,
          failed: true,
          errorMessage: error instanceof Error ? error.message : 'Network error',
        });
        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
      (this as any).__trakletUrl = typeof url === 'string' ? url : url.href;
      (this as any).__trakletMethod = method;
      (this as any).__trakletStartTime = Date.now();
      return originalOpen.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('loadend', () => {
        const duration = Date.now() - (this as any).__trakletStartTime;
        const url = (this as any).__trakletUrl;
        const method = (this as any).__trakletMethod;

        if (url) {
          (window as any).__trakletContextGatherer?.addNetworkRequest({
            url,
            method,
            status: this.status,
            duration,
            failed: this.status === 0 || this.status >= 400,
            errorMessage: this.status >= 400 ? this.statusText : undefined,
          });
        }
      });

      return originalSend.apply(this, arguments as any);
    };

    // Make this instance accessible for XHR intercept
    (window as any).__trakletContextGatherer = this;
  }

  /**
   * Add network request to buffer
   */
  private addNetworkRequest(request: NetworkRequest) {
    // Don't capture Traklet's own requests
    if (request.url.includes('api.anthropic.com') || request.url.includes('api.openai.com')) {
      return;
    }

    this.networkBuffer.push(request);

    // Keep buffer size manageable
    if (this.networkBuffer.length > this.config.maxNetworkRequests * 2) {
      this.networkBuffer = this.networkBuffer.slice(-this.config.maxNetworkRequests);
    }
  }

  /**
   * Clear all captured context (call when issue is submitted)
   */
  clearContext() {
    this.consoleBuffer = [];
    this.networkBuffer = [];
    this.startTime = Date.now();
  }

  /**
   * Cleanup listeners on destroy
   */
  destroy() {
    // Note: We can't fully restore original console/fetch without keeping references
    // This is acceptable as the widget is meant to stay loaded
    delete (window as any).__trakletContextGatherer;
  }
}
