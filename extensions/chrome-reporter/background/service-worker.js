/**
 * Traklet Bug Reporter - Background Service Worker
 * Handles screenshot capture, keyboard shortcuts, and API communication
 */

// ============================================
// Screenshot Capture
// ============================================

async function captureScreenshot(tabId) {
  try {
    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });

    return { success: true, screenshot: dataUrl };
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// Full Page Screenshot (experimental)
// ============================================

async function captureFullPage(tabId) {
  try {
    // Inject script to get full page dimensions
    const [{ result: dimensions }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      })
    });

    // For now, just capture visible area
    // Full page would require stitching multiple captures
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });

    return {
      success: true,
      screenshot: dataUrl,
      dimensions,
      type: 'visible'
    };
  } catch (error) {
    console.error('Full page capture failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// Get Diagnostic Data from Content Script
// ============================================

async function getDiagnosticData(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'GET_DIAGNOSTIC_DATA'
    });

    return response;
  } catch (error) {
    console.error('Failed to get diagnostic data:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// Compile Full Bug Report
// ============================================

async function compileBugReport(tabId, options = {}) {
  const report = {
    id: `bug-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    screenshot: null,
    diagnostics: null,
    userDescription: options.description || '',
    severity: options.severity || 'medium',
    category: options.category || 'bug'
  };

  // Capture screenshot
  if (options.includeScreenshot !== false) {
    const screenshotResult = await captureScreenshot(tabId);
    if (screenshotResult.success) {
      report.screenshot = screenshotResult.screenshot;
    }
  }

  // Get diagnostic data
  if (options.includeDiagnostics !== false) {
    const diagnosticsResult = await getDiagnosticData(tabId);
    if (diagnosticsResult.success) {
      report.diagnostics = diagnosticsResult.data;
    }
  }

  return report;
}

// ============================================
// Storage - Save Reports Locally
// ============================================

async function saveReport(report) {
  const { reports = [] } = await chrome.storage.local.get('reports');
  reports.unshift(report);

  // Keep only last 20 reports
  const trimmedReports = reports.slice(0, 20);

  await chrome.storage.local.set({ reports: trimmedReports });

  return report;
}

async function getReports() {
  const { reports = [] } = await chrome.storage.local.get('reports');
  return reports;
}

async function deleteReport(reportId) {
  const { reports = [] } = await chrome.storage.local.get('reports');
  const filtered = reports.filter(r => r.id !== reportId);
  await chrome.storage.local.set({ reports: filtered });
}

async function clearAllReports() {
  await chrome.storage.local.set({ reports: [] });
}

// ============================================
// Traklet API Integration
// ============================================

async function getConfig() {
  const { trakletConfig = {} } = await chrome.storage.sync.get('trakletConfig');
  return trakletConfig;
}

async function saveConfig(config) {
  await chrome.storage.sync.set({ trakletConfig: config });
}

async function submitToTraklet(report, config) {
  if (!config.endpoint) {
    return { success: false, error: 'No Traklet endpoint configured' };
  }

  try {
    // Format report for Traklet API
    const issueData = {
      title: report.userDescription?.slice(0, 100) || 'Bug Report',
      body: formatIssueBody(report),
      labels: [report.category, `severity:${report.severity}`].filter(Boolean),
      priority: report.severity === 'critical' ? 'critical' :
                report.severity === 'high' ? 'high' :
                report.severity === 'low' ? 'low' : 'medium'
    };

    // If screenshot is included, we'd upload it as an attachment
    // For now, embed as base64 or link

    const response = await fetch(`${config.endpoint}/api/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { 'Authorization': `Bearer ${config.token}` } : {})
      },
      body: JSON.stringify(issueData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return { success: true, issue: result };

  } catch (error) {
    console.error('Failed to submit to Traklet:', error);
    return { success: false, error: error.message };
  }
}

function formatIssueBody(report) {
  const parts = [];

  if (report.userDescription) {
    parts.push(`## Description\n${report.userDescription}`);
  }

  if (report.diagnostics?.environment) {
    const env = report.diagnostics.environment;
    parts.push(`## Environment
- **URL:** ${env.url}
- **Browser:** ${getBrowserFromUA(env.userAgent)}
- **Viewport:** ${env.viewport?.width}x${env.viewport?.height}
- **Screen:** ${env.screen?.width}x${env.screen?.height} @${env.screen?.pixelRatio}x
- **Platform:** ${env.platform}
- **Timezone:** ${env.timezone}
- **Online:** ${env.online ? 'Yes' : 'No'}`);
  }

  if (report.diagnostics?.jsErrors?.length > 0) {
    parts.push(`## JavaScript Errors
\`\`\`
${report.diagnostics.jsErrors.map(e =>
  `[${e.type}] ${e.message}\n${e.stack || ''}`
).join('\n\n')}
\`\`\``);
  }

  if (report.diagnostics?.consoleLogs?.filter(l => l.level === 'error' || l.level === 'warn').length > 0) {
    const errorLogs = report.diagnostics.consoleLogs.filter(l => l.level === 'error' || l.level === 'warn');
    parts.push(`## Console Errors/Warnings
\`\`\`
${errorLogs.slice(-10).map(l =>
  `[${l.level.toUpperCase()}] ${l.message}`
).join('\n')}
\`\`\``);
  }

  if (report.diagnostics?.performance) {
    const perf = report.diagnostics.performance;
    parts.push(`## Performance
- **Page Load:** ${perf.pageLoadTime?.toFixed(0)}ms
- **DOM Ready:** ${perf.domContentLoaded?.toFixed(0)}ms
- **First Paint:** ${perf.firstContentfulPaint?.toFixed(0)}ms
- **Resources:** ${perf.resourceCount}
${perf.memory ? `- **Memory:** ${perf.memory.usedJSHeapSize}MB / ${perf.memory.totalJSHeapSize}MB` : ''}`);
  }

  if (report.diagnostics?.userActions?.length > 0) {
    parts.push(`## Recent User Actions
${report.diagnostics.userActions.slice(-5).map(a =>
  `- ${a.type} on \`<${a.target}${a.id ? '#' + a.id : ''}>\``
).join('\n')}`);
  }

  parts.push(`---
*Report ID: ${report.id}*
*Captured: ${report.createdAt}*`);

  return parts.join('\n\n');
}

function getBrowserFromUA(userAgent) {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
}

// ============================================
// Message Handlers
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'CAPTURE_SCREENSHOT': {
        const tab = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await captureScreenshot(tab[0]?.id);
        sendResponse(result);
        break;
      }

      case 'CAPTURE_FULL_PAGE': {
        const tab = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await captureFullPage(tab[0]?.id);
        sendResponse(result);
        break;
      }

      case 'COMPILE_REPORT': {
        const tab = await chrome.tabs.query({ active: true, currentWindow: true });
        const report = await compileBugReport(tab[0]?.id, message.options);
        sendResponse({ success: true, report });
        break;
      }

      case 'SAVE_REPORT': {
        const saved = await saveReport(message.report);
        sendResponse({ success: true, report: saved });
        break;
      }

      case 'GET_REPORTS': {
        const reports = await getReports();
        sendResponse({ success: true, reports });
        break;
      }

      case 'DELETE_REPORT': {
        await deleteReport(message.reportId);
        sendResponse({ success: true });
        break;
      }

      case 'CLEAR_REPORTS': {
        await clearAllReports();
        sendResponse({ success: true });
        break;
      }

      case 'GET_CONFIG': {
        const config = await getConfig();
        sendResponse({ success: true, config });
        break;
      }

      case 'SAVE_CONFIG': {
        await saveConfig(message.config);
        sendResponse({ success: true });
        break;
      }

      case 'SUBMIT_TO_TRAKLET': {
        const config = await getConfig();
        const result = await submitToTraklet(message.report, config);
        sendResponse(result);
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();

  return true; // Async response
});

// ============================================
// Keyboard Shortcut Handler
// ============================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-bug') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      // Compile a quick report
      const report = await compileBugReport(tab.id, {
        includeScreenshot: true,
        includeDiagnostics: true
      });

      // Save locally
      await saveReport(report);

      // Notify user
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

      setTimeout(async () => {
        await chrome.action.setBadgeText({ text: '' });
      }, 2000);
    }
  }
});

// ============================================
// Context Menu
// ============================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'traklet-report-bug',
    title: 'Report Bug with Traklet',
    contexts: ['page', 'selection', 'image']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'traklet-report-bug') {
    const report = await compileBugReport(tab.id, {
      includeScreenshot: true,
      includeDiagnostics: true,
      description: info.selectionText || ''
    });

    await saveReport(report);

    // Open popup or show notification
    await chrome.action.openPopup();
  }
});

console.log('[Traklet Reporter] Service worker initialized');
