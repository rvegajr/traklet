/**
 * Traklet Bug Reporter - Content Script
 * Collects diagnostic information from the page
 */

(function() {
  'use strict';

  // Store for collected data
  const diagnosticData = {
    consoleLogs: [],
    networkErrors: [],
    jsErrors: [],
    performanceMetrics: null,
    userActions: [],
    maxLogs: 100
  };

  // ============================================
  // Console Log Interceptor
  // ============================================

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  function formatArgs(args) {
    return Array.from(args).map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2).slice(0, 500);
        } catch {
          return '[Object]';
        }
      }
      return String(arg).slice(0, 500);
    }).join(' ');
  }

  function interceptConsole(level) {
    return function(...args) {
      // Call original
      originalConsole[level].apply(console, args);

      // Store log entry
      const entry = {
        level,
        message: formatArgs(args),
        timestamp: new Date().toISOString(),
        url: window.location.href
      };

      diagnosticData.consoleLogs.push(entry);

      // Keep only last N logs
      if (diagnosticData.consoleLogs.length > diagnosticData.maxLogs) {
        diagnosticData.consoleLogs.shift();
      }
    };
  }

  // Override console methods
  console.log = interceptConsole('log');
  console.warn = interceptConsole('warn');
  console.error = interceptConsole('error');
  console.info = interceptConsole('info');
  console.debug = interceptConsole('debug');

  // ============================================
  // JavaScript Error Interceptor
  // ============================================

  window.addEventListener('error', (event) => {
    const entry = {
      type: 'uncaught',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 1000) || '',
      timestamp: new Date().toISOString()
    };

    diagnosticData.jsErrors.push(entry);

    if (diagnosticData.jsErrors.length > 50) {
      diagnosticData.jsErrors.shift();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const entry = {
      type: 'unhandled-promise',
      message: String(event.reason),
      stack: event.reason?.stack?.slice(0, 1000) || '',
      timestamp: new Date().toISOString()
    };

    diagnosticData.jsErrors.push(entry);

    if (diagnosticData.jsErrors.length > 50) {
      diagnosticData.jsErrors.shift();
    }
  });

  // ============================================
  // Network Error Tracking (via Performance API)
  // ============================================

  function collectNetworkErrors() {
    if (!window.PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Track failed requests (no transferSize usually means error)
          if (entry.transferSize === 0 && entry.decodedBodySize === 0) {
            diagnosticData.networkErrors.push({
              url: entry.name,
              type: entry.initiatorType,
              duration: entry.duration,
              timestamp: new Date().toISOString()
            });

            if (diagnosticData.networkErrors.length > 20) {
              diagnosticData.networkErrors.shift();
            }
          }
        }
      });

      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // PerformanceObserver may not be available in all contexts
    }
  }

  collectNetworkErrors();

  // ============================================
  // User Action Tracking (optional, privacy-conscious)
  // ============================================

  function trackUserAction(type, target) {
    const entry = {
      type,
      target: target.tagName?.toLowerCase() || 'unknown',
      id: target.id || undefined,
      className: target.className?.slice?.(0, 50) || undefined,
      text: target.textContent?.slice(0, 30) || undefined,
      timestamp: new Date().toISOString()
    };

    diagnosticData.userActions.push(entry);

    if (diagnosticData.userActions.length > 20) {
      diagnosticData.userActions.shift();
    }
  }

  document.addEventListener('click', (e) => trackUserAction('click', e.target), { passive: true });

  // ============================================
  // Performance Metrics Collection
  // ============================================

  function collectPerformanceMetrics() {
    const perf = window.performance;
    if (!perf) return null;

    const navigation = perf.getEntriesByType?.('navigation')?.[0];
    const paint = perf.getEntriesByType?.('paint') || [];

    const metrics = {
      // Page load timing
      pageLoadTime: navigation?.loadEventEnd - navigation?.startTime,
      domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.startTime,
      firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,

      // Memory (if available)
      memory: perf.memory ? {
        usedJSHeapSize: Math.round(perf.memory.usedJSHeapSize / 1048576),
        totalJSHeapSize: Math.round(perf.memory.totalJSHeapSize / 1048576)
      } : null,

      // Resource count
      resourceCount: perf.getEntriesByType?.('resource')?.length || 0
    };

    return metrics;
  }

  // ============================================
  // Environment Information
  // ============================================

  function getEnvironmentInfo() {
    const nav = navigator;

    return {
      // Browser info
      userAgent: nav.userAgent,
      language: nav.language,
      languages: nav.languages?.slice(0, 3),
      cookiesEnabled: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack,
      online: nav.onLine,

      // Platform
      platform: nav.platform,
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,

      // Screen
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio
      },

      // Viewport
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },

      // Page info
      url: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
      referrer: document.referrer,
      title: document.title,

      // Timing
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset()
    };
  }

  // ============================================
  // DOM State Snapshot
  // ============================================

  function getDOMSnapshot() {
    return {
      // Forms state (without values for privacy)
      forms: Array.from(document.forms).map(form => ({
        id: form.id,
        name: form.name,
        action: form.action,
        method: form.method,
        fieldCount: form.elements.length
      })),

      // Visible modals/dialogs
      dialogs: Array.from(document.querySelectorAll('dialog[open], [role="dialog"]:not([hidden])')).map(d => ({
        id: d.id,
        className: d.className?.slice(0, 50)
      })),

      // Active element
      activeElement: {
        tag: document.activeElement?.tagName?.toLowerCase(),
        id: document.activeElement?.id,
        type: document.activeElement?.type
      },

      // Document state
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus()
    };
  }

  // ============================================
  // Message Handler - Respond to Extension
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_DIAGNOSTIC_DATA') {
      const data = {
        environment: getEnvironmentInfo(),
        performance: collectPerformanceMetrics(),
        consoleLogs: [...diagnosticData.consoleLogs],
        jsErrors: [...diagnosticData.jsErrors],
        networkErrors: [...diagnosticData.networkErrors],
        userActions: [...diagnosticData.userActions],
        domSnapshot: getDOMSnapshot(),
        collectedAt: new Date().toISOString()
      };

      sendResponse({ success: true, data });
    }

    if (message.type === 'CLEAR_LOGS') {
      diagnosticData.consoleLogs = [];
      diagnosticData.jsErrors = [];
      diagnosticData.networkErrors = [];
      diagnosticData.userActions = [];
      sendResponse({ success: true });
    }

    if (message.type === 'PING') {
      sendResponse({ success: true, ready: true });
    }

    // Return true to indicate async response
    return true;
  });

  // ============================================
  // Traklet Widget Detection
  // ============================================

  function detectTrakletWidget() {
    // Check if Traklet is present
    const widget = document.querySelector('traklet-widget');
    const trakletGlobal = window.Traklet || window.__TRAKLET__;

    // Try to get configuration from the widget
    let config = null;
    if (trakletGlobal?.getConfig) {
      try {
        config = trakletGlobal.getConfig();
      } catch (e) {
        // Config may not be accessible
      }
    }

    return {
      widgetPresent: !!widget,
      globalPresent: !!trakletGlobal,
      version: trakletGlobal?.VERSION || null,
      config: config ? {
        projectId: config.projectId,
        endpoint: config.endpoint
      } : null
    };
  }

  // Expose detection for the extension
  window.__TRAKLET_REPORTER__ = {
    getDiagnostics: () => ({
      environment: getEnvironmentInfo(),
      performance: collectPerformanceMetrics(),
      consoleLogs: [...diagnosticData.consoleLogs],
      jsErrors: [...diagnosticData.jsErrors],
      networkErrors: [...diagnosticData.networkErrors],
      userActions: [...diagnosticData.userActions],
      domSnapshot: getDOMSnapshot(),
      traklet: detectTrakletWidget()
    }),
    clearLogs: () => {
      diagnosticData.consoleLogs = [];
      diagnosticData.jsErrors = [];
      diagnosticData.networkErrors = [];
      diagnosticData.userActions = [];
    }
  };

  // Log that collector is active (in debug mode)
  originalConsole.debug('[Traklet Reporter] Diagnostic collector initialized');
})();
