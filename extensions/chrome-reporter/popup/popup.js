/**
 * Traklet Bug Reporter - Popup Script
 * Handles UI interactions and communicates with background service worker
 */

// ============================================
// State
// ============================================

const state = {
  screenshot: null,
  diagnostics: null,
  currentView: 'capture'
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Views
  captureView: document.getElementById('captureView'),
  settingsView: document.getElementById('settingsView'),
  successView: document.getElementById('successView'),
  historyView: document.getElementById('historyView'),

  // Screenshot
  screenshotPlaceholder: document.getElementById('screenshotPlaceholder'),
  screenshotPreview: document.getElementById('screenshotPreview'),
  retakeBtn: document.getElementById('retakeBtn'),

  // Form
  description: document.getElementById('description'),
  severity: document.getElementById('severity'),
  category: document.getElementById('category'),
  includeConsole: document.getElementById('includeConsole'),
  includeNetwork: document.getElementById('includeNetwork'),
  includePerformance: document.getElementById('includePerformance'),

  // Diagnostics
  toggleDiagnostics: document.getElementById('toggleDiagnostics'),
  diagnosticsContent: document.getElementById('diagnosticsContent'),
  diagUrl: document.getElementById('diagUrl'),
  diagBrowser: document.getElementById('diagBrowser'),
  diagViewport: document.getElementById('diagViewport'),
  diagErrors: document.getElementById('diagErrors'),
  diagJsErrors: document.getElementById('diagJsErrors'),

  // Buttons
  captureBtn: document.getElementById('captureBtn'),
  submitBtn: document.getElementById('submitBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  backBtn: document.getElementById('backBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  newReportBtn: document.getElementById('newReportBtn'),
  historyBtn: document.getElementById('historyBtn'),
  historyBackBtn: document.getElementById('historyBackBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),

  // Settings
  endpoint: document.getElementById('endpoint'),
  token: document.getElementById('token'),
  projectId: document.getElementById('projectId'),

  // Other
  loadingOverlay: document.getElementById('loadingOverlay'),
  successMessage: document.getElementById('successMessage'),
  reportsList: document.getElementById('reportsList'),
  trakletStatus: document.getElementById('trakletStatus')
};

// ============================================
// View Management
// ============================================

function showView(viewName) {
  state.currentView = viewName;

  elements.captureView.classList.toggle('hidden', viewName !== 'capture');
  elements.settingsView.classList.toggle('hidden', viewName !== 'settings');
  elements.successView.classList.toggle('hidden', viewName !== 'success');
  elements.historyView.classList.toggle('hidden', viewName !== 'history');
}

function showLoading(show = true) {
  elements.loadingOverlay.classList.toggle('hidden', !show);
}

// ============================================
// Screenshot Capture
// ============================================

async function captureScreenshot() {
  showLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });

    if (response.success) {
      state.screenshot = response.screenshot;
      showScreenshot(response.screenshot);
      await loadDiagnostics();
      updateSubmitButton();
    } else {
      console.error('Screenshot failed:', response.error);
      alert('Failed to capture screenshot: ' + response.error);
    }
  } catch (error) {
    console.error('Screenshot error:', error);
    alert('Failed to capture screenshot');
  } finally {
    showLoading(false);
  }
}

function showScreenshot(dataUrl) {
  elements.screenshotPreview.src = dataUrl;
  elements.screenshotPreview.classList.remove('hidden');
  elements.screenshotPlaceholder.classList.add('hidden');
  elements.retakeBtn.classList.remove('hidden');
}

function clearScreenshot() {
  state.screenshot = null;
  elements.screenshotPreview.classList.add('hidden');
  elements.screenshotPlaceholder.classList.remove('hidden');
  elements.retakeBtn.classList.add('hidden');
  updateSubmitButton();
}

// ============================================
// Diagnostics
// ============================================

async function loadDiagnostics() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_DIAGNOSTIC_DATA'
    });

    if (response.success) {
      state.diagnostics = response.data;
      updateDiagnosticsUI(response.data);
    }
  } catch (error) {
    console.error('Failed to load diagnostics:', error);
  }
}

function updateDiagnosticsUI(data) {
  if (!data) return;

  const env = data.environment || {};

  // URL (truncated)
  elements.diagUrl.textContent = env.url?.slice(0, 40) + (env.url?.length > 40 ? '...' : '') || '-';

  // Browser
  const browser = getBrowserFromUA(env.userAgent || '');
  elements.diagBrowser.textContent = browser;

  // Viewport
  elements.diagViewport.textContent = env.viewport
    ? `${env.viewport.width}x${env.viewport.height}`
    : '-';

  // Console errors/warnings
  const errorCount = data.consoleLogs?.filter(l => l.level === 'error' || l.level === 'warn').length || 0;
  elements.diagErrors.textContent = errorCount > 0 ? `${errorCount} entries` : 'None';

  // JS errors
  const jsErrorCount = data.jsErrors?.length || 0;
  elements.diagJsErrors.textContent = jsErrorCount > 0 ? `${jsErrorCount} errors` : 'None';

  // Show Traklet widget status if detected
  if (data.traklet?.widgetPresent || data.traklet?.globalPresent) {
    elements.trakletStatus.classList.remove('hidden');

    // If widget has config, offer to use it
    if (data.traklet.config?.endpoint) {
      applyTrakletConfig(data.traklet.config);
    }
  }
}

async function applyTrakletConfig(widgetConfig) {
  // Check if we already have a config
  const { config } = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

  // Only apply widget config if no endpoint is configured
  if (!config?.endpoint && widgetConfig.endpoint) {
    await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      config: {
        endpoint: widgetConfig.endpoint,
        projectId: widgetConfig.projectId || '',
        token: ''
      }
    });
  }
}

function getBrowserFromUA(userAgent) {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function toggleDiagnostics() {
  const isOpen = !elements.diagnosticsContent.classList.contains('hidden');
  elements.diagnosticsContent.classList.toggle('hidden', isOpen);
  elements.toggleDiagnostics.classList.toggle('open', !isOpen);
}

// ============================================
// Submit Report
// ============================================

function updateSubmitButton() {
  elements.submitBtn.disabled = !state.screenshot;
}

async function submitReport() {
  if (!state.screenshot) return;

  showLoading(true);

  try {
    // Compile full report
    const report = {
      id: `bug-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      screenshot: state.screenshot,
      diagnostics: filterDiagnostics(state.diagnostics),
      userDescription: elements.description.value.trim(),
      severity: elements.severity.value,
      category: elements.category.value
    };

    // Save locally first
    await chrome.runtime.sendMessage({
      type: 'SAVE_REPORT',
      report
    });

    // Try to submit to Traklet if configured
    const { config } = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

    if (config?.endpoint) {
      const submitResult = await chrome.runtime.sendMessage({
        type: 'SUBMIT_TO_TRAKLET',
        report
      });

      if (submitResult.success) {
        elements.successMessage.textContent = 'Bug report submitted successfully!';
      } else {
        elements.successMessage.textContent = 'Report saved locally. Could not submit to server.';
      }
    } else {
      elements.successMessage.textContent = 'Report saved locally. Configure endpoint to submit online.';
    }

    showView('success');
    resetForm();

  } catch (error) {
    console.error('Submit error:', error);
    alert('Failed to submit report: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function filterDiagnostics(data) {
  if (!data) return null;

  const filtered = { ...data };

  if (!elements.includeConsole.checked) {
    filtered.consoleLogs = [];
  }

  if (!elements.includeNetwork.checked) {
    filtered.networkErrors = [];
  }

  if (!elements.includePerformance.checked) {
    filtered.performance = null;
  }

  return filtered;
}

function resetForm() {
  state.screenshot = null;
  state.diagnostics = null;

  elements.screenshotPreview.classList.add('hidden');
  elements.screenshotPlaceholder.classList.remove('hidden');
  elements.retakeBtn.classList.add('hidden');
  elements.description.value = '';
  elements.severity.value = 'medium';
  elements.category.value = 'bug';
  elements.submitBtn.disabled = true;
}

// ============================================
// Settings
// ============================================

async function loadSettings() {
  const { config } = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

  if (config) {
    elements.endpoint.value = config.endpoint || '';
    elements.token.value = config.token || '';
    elements.projectId.value = config.projectId || '';
  }
}

async function saveSettings() {
  const config = {
    endpoint: elements.endpoint.value.trim(),
    token: elements.token.value.trim(),
    projectId: elements.projectId.value.trim()
  };

  await chrome.runtime.sendMessage({
    type: 'SAVE_CONFIG',
    config
  });

  showView('capture');
}

// ============================================
// History
// ============================================

async function loadHistory() {
  const { reports } = await chrome.runtime.sendMessage({ type: 'GET_REPORTS' });

  if (!reports || reports.length === 0) {
    elements.reportsList.innerHTML = '<p class="empty-state">No reports yet</p>';
    return;
  }

  elements.reportsList.innerHTML = reports.map(report => `
    <div class="report-item" data-id="${report.id}">
      <img class="report-thumbnail" src="${report.screenshot || ''}" alt="Screenshot">
      <div class="report-info">
        <div class="report-title">${escapeHtml(report.userDescription || 'No description')}</div>
        <div class="report-meta">
          <span class="severity-badge ${report.severity}">${report.severity}</span>
          ${formatDate(report.createdAt)}
        </div>
      </div>
      <button class="report-delete" data-id="${report.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </div>
  `).join('');

  // Add delete handlers
  elements.reportsList.querySelectorAll('.report-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await chrome.runtime.sendMessage({ type: 'DELETE_REPORT', reportId: id });
      loadHistory();
    });
  });
}

async function clearHistory() {
  if (confirm('Delete all saved reports?')) {
    await chrome.runtime.sendMessage({ type: 'CLEAR_REPORTS' });
    loadHistory();
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Screenshot
  elements.screenshotPlaceholder.addEventListener('click', captureScreenshot);
  elements.retakeBtn.addEventListener('click', () => {
    clearScreenshot();
    captureScreenshot();
  });

  // Capture button
  elements.captureBtn.addEventListener('click', captureScreenshot);

  // Submit
  elements.submitBtn.addEventListener('click', submitReport);

  // Diagnostics toggle
  elements.toggleDiagnostics.addEventListener('click', toggleDiagnostics);

  // Settings
  elements.settingsBtn.addEventListener('click', () => {
    loadSettings();
    showView('settings');
  });
  elements.backBtn.addEventListener('click', () => showView('capture'));
  elements.saveConfigBtn.addEventListener('click', saveSettings);

  // Success
  elements.newReportBtn.addEventListener('click', () => {
    resetForm();
    showView('capture');
  });

  // History
  elements.historyBtn.addEventListener('click', () => {
    loadHistory();
    showView('history');
  });
  elements.historyBackBtn.addEventListener('click', () => showView('capture'));
  elements.clearHistoryBtn.addEventListener('click', clearHistory);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (!elements.submitBtn.disabled) {
        submitReport();
      }
    }
  });
}

// ============================================
// Initialize
// ============================================

async function init() {
  setupEventListeners();

  // Auto-capture on popup open
  await captureScreenshot();
}

// Start
document.addEventListener('DOMContentLoaded', init);
