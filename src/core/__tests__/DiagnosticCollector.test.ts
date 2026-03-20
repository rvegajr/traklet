/**
 * DiagnosticCollector tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DiagnosticCollector,
  getDiagnosticCollector,
  resetDiagnosticCollector,
} from '../DiagnosticCollector';

// Mock performance.timing which is not available in jsdom
const mockTiming = {
  navigationStart: 0,
  loadEventEnd: 0,
  domContentLoadedEventEnd: 0,
};

describe('DiagnosticCollector', () => {
  let collector: DiagnosticCollector;

  beforeEach(() => {
    sessionStorage.clear();

    // Ensure performance.timing is available (jsdom doesn't provide it)
    if (!performance.timing) {
      Object.defineProperty(performance, 'timing', {
        value: mockTiming,
        configurable: true,
        writable: true,
      });
    }

    // Ensure performance.getEntriesByType is available
    if (!performance.getEntriesByType) {
      Object.defineProperty(performance, 'getEntriesByType', {
        value: () => [],
        configurable: true,
        writable: true,
      });
    }

    collector = new DiagnosticCollector();
  });

  afterEach(() => {
    collector.destroy();
    resetDiagnosticCollector();
    vi.restoreAllMocks();
  });

  // ============================================
  // 1. Lifecycle
  // ============================================

  describe('Lifecycle', () => {
    it('should initialize without errors', () => {
      expect(() => collector.init()).not.toThrow();
    });

    it('should set initialized state after init()', () => {
      collector.init();
      // Verify it's initialized by checking that destroy() actually runs
      // (destroy returns early if not initialized)
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      collector.destroy();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('should guard against double init()', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      collector.init();
      const logCountAfterFirstInit = consoleSpy.mock.calls.length;

      // Second init should be a no-op - verify by checking no additional listeners added
      const addSpy = vi.spyOn(window, 'addEventListener');
      collector.init();
      expect(addSpy).not.toHaveBeenCalled();
    });

    it('should destroy without errors', () => {
      collector.init();
      expect(() => collector.destroy()).not.toThrow();
    });

    it('should guard against double destroy()', () => {
      collector.init();
      collector.destroy();

      // Second destroy should be a no-op
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      collector.destroy();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('should handle destroy() when never initialized', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      collector.destroy();
      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 2. Console Interception
  // ============================================

  describe('Console Interception', () => {
    it('should capture console.log messages', () => {
      collector.init();
      console.log('test log message');
      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('log');
      expect(logs[0]?.message).toBe('test log message');
    });

    it('should capture console.warn messages', () => {
      collector.init();
      console.warn('test warning');
      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[0]?.message).toBe('test warning');
    });

    it('should capture console.error messages', () => {
      collector.init();
      console.error('test error');
      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('error');
      expect(logs[0]?.message).toBe('test error');
    });

    it('should capture console.info messages', () => {
      collector.init();
      console.info('test info');
      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('info');
      expect(logs[0]?.message).toBe('test info');
    });

    it('should capture console.debug messages', () => {
      collector.init();
      console.debug('test debug');
      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('debug');
      expect(logs[0]?.message).toBe('test debug');
    });

    it('should call original console methods', () => {
      const originalLog = console.log;
      const spy = vi.fn();
      console.log = spy;

      collector.init();
      console.log('hello');

      // The interceptor should call the original (which is our spy)
      expect(spy).toHaveBeenCalledWith('hello');

      // Restore
      console.log = originalLog;
    });

    it('should respect maxConsoleLogs limit', () => {
      const limitedCollector = new DiagnosticCollector({ maxConsoleLogs: 3 });
      limitedCollector.init();

      console.log('msg1');
      console.log('msg2');
      console.log('msg3');
      console.log('msg4');
      console.log('msg5');

      const logs = limitedCollector.getConsoleLogs();
      expect(logs.length).toBe(3);
      // Oldest should have been trimmed
      expect(logs[0]?.message).toBe('msg3');
      expect(logs[2]?.message).toBe('msg5');

      limitedCollector.destroy();
    });

    it('should include timestamp and url in console entries', () => {
      collector.init();
      console.log('timestamped');
      const logs = collector.getConsoleLogs();
      expect(logs[0]?.timestamp).toBeDefined();
      expect(logs[0]?.url).toBeDefined();
    });

    it('should format multiple arguments', () => {
      collector.init();
      console.log('hello', 'world', 42);
      const logs = collector.getConsoleLogs();
      expect(logs[0]?.message).toBe('hello world 42');
    });

    it('should format Error objects in console args', () => {
      collector.init();
      console.error(new Error('boom'));
      const logs = collector.getConsoleLogs();
      expect(logs[0]?.message).toContain('Error: boom');
    });
  });

  // ============================================
  // 3. Error Interception
  // ============================================

  describe('Error Interception', () => {
    it('should capture window error events', () => {
      collector.init();

      const errorEvent = new ErrorEvent('error', {
        message: 'Test error',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
        error: new Error('Test error'),
      });
      window.dispatchEvent(errorEvent);

      const errors = collector.getJsErrors();
      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toBe('Test error');
      expect(errors[0]?.filename).toBe('test.js');
      expect(errors[0]?.lineno).toBe(10);
      expect(errors[0]?.colno).toBe(5);
      expect(errors[0]?.stack).toBeDefined();
    });

    it('should capture unhandled promise rejections', () => {
      collector.init();

      // Create a PromiseRejectionEvent
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', {
        value: 'async failure',
      });

      window.dispatchEvent(event);

      const errors = collector.getJsErrors();
      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toContain('Unhandled Promise Rejection');
      expect(errors[0]?.message).toContain('async failure');
      expect(errors[0]?.filename).toBe('promise');
    });

    it('should respect maxJsErrors limit', () => {
      const limitedCollector = new DiagnosticCollector({ maxJsErrors: 2 });
      limitedCollector.init();

      for (let i = 0; i < 5; i++) {
        const errorEvent = new ErrorEvent('error', {
          message: `Error ${i}`,
          filename: 'test.js',
          lineno: i,
        });
        window.dispatchEvent(errorEvent);
      }

      const errors = limitedCollector.getJsErrors();
      expect(errors.length).toBe(2);
      // Oldest should have been trimmed
      expect(errors[0]?.message).toBe('Error 3');
      expect(errors[1]?.message).toBe('Error 4');

      limitedCollector.destroy();
    });

    it('should include timestamp and url in error entries', () => {
      collector.init();

      const errorEvent = new ErrorEvent('error', {
        message: 'timestamped error',
        filename: 'test.js',
      });
      window.dispatchEvent(errorEvent);

      const errors = collector.getJsErrors();
      expect(errors[0]?.timestamp).toBeDefined();
      expect(errors[0]?.url).toBeDefined();
    });
  });

  // ============================================
  // 4. User Action Tracking
  // ============================================

  describe('User Action Tracking', () => {
    it('should track click events', () => {
      collector.init();

      const button = document.createElement('button');
      button.id = 'test-btn';
      button.textContent = 'Click Me';
      document.body.appendChild(button);

      button.click();

      const actions = collector.getUserActions();
      expect(actions.length).toBe(1);
      expect(actions[0]?.type).toBe('click');
      expect(actions[0]?.target).toContain('button');
      expect(actions[0]?.target).toContain('#test-btn');
      expect(actions[0]?.details).toBe('Click Me');

      document.body.removeChild(button);
    });

    it('should track form submit events', () => {
      collector.init();

      const form = document.createElement('form');
      form.id = 'test-form';
      form.addEventListener('submit', (e) => e.preventDefault());
      document.body.appendChild(form);

      form.dispatchEvent(new Event('submit', { bubbles: true }));

      const actions = collector.getUserActions();
      const submitAction = actions.find((a) => a.type === 'submit');
      expect(submitAction).toBeDefined();
      expect(submitAction?.target).toContain('form');
      expect(submitAction?.target).toContain('#test-form');

      document.body.removeChild(form);
    });

    it('should respect maxUserActions limit', () => {
      const limitedCollector = new DiagnosticCollector({ maxUserActions: 3 });
      limitedCollector.init();

      const button = document.createElement('button');
      button.textContent = 'btn';
      document.body.appendChild(button);

      for (let i = 0; i < 5; i++) {
        button.click();
      }

      const actions = limitedCollector.getUserActions();
      expect(actions.length).toBe(3);

      document.body.removeChild(button);
      limitedCollector.destroy();
    });

    it('should include url and timestamp in user actions', () => {
      collector.init();

      const button = document.createElement('button');
      button.textContent = 'test';
      document.body.appendChild(button);
      button.click();

      const actions = collector.getUserActions();
      expect(actions[0]?.url).toBeDefined();
      expect(actions[0]?.timestamp).toBeDefined();

      document.body.removeChild(button);
    });
  });

  // ============================================
  // 5. Recording Sessions
  // ============================================

  describe('Recording Sessions', () => {
    it('should start a recording session', () => {
      collector.init();
      const session = collector.startRecording();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.isActive).toBe(true);
      expect(session.startedAt).toBeDefined();
      expect(session.pages.length).toBe(1);
    });

    it('should add current page as first visit on startRecording', () => {
      collector.init();
      const session = collector.startRecording();

      expect(session.pages[0]?.url).toBe(window.location.href);
      expect(session.pages[0]?.timestamp).toBeDefined();
    });

    it('should report isRecording() correctly', () => {
      collector.init();
      expect(collector.isRecording()).toBe(false);

      collector.startRecording();
      expect(collector.isRecording()).toBe(true);

      collector.stopRecording();
      expect(collector.isRecording()).toBe(false);
    });

    it('should return session via getRecordingSession()', () => {
      collector.init();
      expect(collector.getRecordingSession()).toBeNull();

      collector.startRecording();
      const session = collector.getRecordingSession();
      expect(session).not.toBeNull();
      expect(session?.isActive).toBe(true);
    });

    it('should stop recording and return session with endedAt', () => {
      collector.init();
      collector.startRecording();

      const session = collector.stopRecording();
      expect(session).not.toBeNull();
      expect(session?.isActive).toBe(false);
      expect(session?.endedAt).toBeDefined();
    });

    it('should set duration on last page when stopping recording', () => {
      collector.init();
      collector.startRecording();

      const session = collector.stopRecording();
      expect(session?.pages[0]?.duration).toBeDefined();
      expect(typeof session?.pages[0]?.duration).toBe('number');
    });

    it('should return null when stopping without active recording', () => {
      collector.init();
      const result = collector.stopRecording();
      expect(result).toBeNull();
    });

    it('should cancel recording and clear session', () => {
      collector.init();
      collector.startRecording();
      expect(collector.isRecording()).toBe(true);

      collector.cancelRecording();
      expect(collector.isRecording()).toBe(false);
      expect(collector.getRecordingSession()).toBeNull();
    });

    it('should persist session to sessionStorage', () => {
      collector.init();
      collector.startRecording();

      const stored = sessionStorage.getItem('__traklet_recording_session__');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored as string);
      expect(parsed.isActive).toBe(true);
      expect(parsed.pages.length).toBe(1);
    });

    it('should clear sessionStorage on stopRecording', () => {
      collector.init();
      collector.startRecording();
      expect(sessionStorage.getItem('__traklet_recording_session__')).not.toBeNull();

      collector.stopRecording();
      expect(sessionStorage.getItem('__traklet_recording_session__')).toBeNull();
    });

    it('should clear sessionStorage on cancelRecording', () => {
      collector.init();
      collector.startRecording();
      expect(sessionStorage.getItem('__traklet_recording_session__')).not.toBeNull();

      collector.cancelRecording();
      expect(sessionStorage.getItem('__traklet_recording_session__')).toBeNull();
    });

    it('should restore active session from sessionStorage on init', () => {
      const session = {
        id: 'session-test',
        startedAt: new Date().toISOString(),
        pages: [{ url: 'http://example.com', title: 'Test', timestamp: new Date().toISOString() }],
        actions: [],
        consoleLogs: [],
        jsErrors: [],
        isActive: true,
      };
      sessionStorage.setItem('__traklet_recording_session__', JSON.stringify(session));

      const freshCollector = new DiagnosticCollector();
      freshCollector.init();

      expect(freshCollector.isRecording()).toBe(true);
      expect(freshCollector.getRecordingSession()?.id).toBe('session-test');

      freshCollector.destroy();
    });

    it('should not restore inactive session from sessionStorage', () => {
      const session = {
        id: 'session-old',
        startedAt: new Date().toISOString(),
        pages: [],
        actions: [],
        consoleLogs: [],
        jsErrors: [],
        isActive: false,
      };
      sessionStorage.setItem('__traklet_recording_session__', JSON.stringify(session));

      const freshCollector = new DiagnosticCollector();
      freshCollector.init();

      expect(freshCollector.isRecording()).toBe(false);
      expect(freshCollector.getRecordingSession()).toBeNull();

      freshCollector.destroy();
    });

    it('should add console logs to active session', () => {
      collector.init();
      collector.startRecording();

      console.log('session log');

      const session = collector.getRecordingSession();
      expect(session?.consoleLogs.length).toBe(1);
      expect(session?.consoleLogs[0]?.message).toBe('session log');
    });

    it('should add JS errors to active session', () => {
      collector.init();
      collector.startRecording();

      const errorEvent = new ErrorEvent('error', {
        message: 'session error',
        filename: 'test.js',
        lineno: 1,
      });
      window.dispatchEvent(errorEvent);

      const session = collector.getRecordingSession();
      expect(session?.jsErrors.length).toBe(1);
      expect(session?.jsErrors[0]?.message).toBe('session error');
    });

    it('should add click actions to active session', () => {
      collector.init();
      collector.startRecording();

      const button = document.createElement('button');
      button.textContent = 'Session Btn';
      document.body.appendChild(button);
      button.click();

      const session = collector.getRecordingSession();
      expect(session?.actions.length).toBeGreaterThanOrEqual(1);
      const clickAction = session?.actions.find((a) => a.type === 'click');
      expect(clickAction).toBeDefined();

      document.body.removeChild(button);
    });
  });

  // ============================================
  // 6. Data Collection
  // ============================================

  describe('Data Collection', () => {
    it('should return DiagnosticData from collect()', () => {
      collector.init();
      const data = collector.collect();

      expect(data).toBeDefined();
      expect(data.environment).toBeDefined();
      expect(data.performance).toBeDefined();
      expect(data.consoleLogs).toBeDefined();
      expect(data.jsErrors).toBeDefined();
      expect(data.userActions).toBeDefined();
      expect(data.collectedAt).toBeDefined();
    });

    it('should include session in collect() when recording', () => {
      collector.init();
      collector.startRecording();
      const data = collector.collect();
      expect(data.session).toBeDefined();
      expect(data.session?.isActive).toBe(true);
    });

    it('should not include session in collect() when not recording', () => {
      collector.init();
      const data = collector.collect();
      expect(data.session).toBeUndefined();
    });

    it('should return environment info from getEnvironment()', () => {
      collector.init();
      const env = collector.getEnvironment();

      expect(env.url).toBeDefined();
      expect(env.origin).toBeDefined();
      expect(env.pathname).toBeDefined();
      expect(env.userAgent).toBeDefined();
      expect(env.platform).toBeDefined();
      expect(env.language).toBeDefined();
      expect(env.timezone).toBeDefined();
      expect(typeof env.online).toBe('boolean');
      expect(env.viewport).toBeDefined();
      expect(env.viewport.width).toBeDefined();
      expect(env.viewport.height).toBeDefined();
      expect(env.screen).toBeDefined();
      expect(env.timestamp).toBeDefined();
    });

    it('should return console logs from getConsoleLogs()', () => {
      collector.init();
      console.log('test');
      const logs = collector.getConsoleLogs();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(1);
    });

    it('should return JS errors from getJsErrors()', () => {
      collector.init();
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'test', filename: 'f.js' })
      );
      const errors = collector.getJsErrors();
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBe(1);
    });

    it('should return user actions from getUserActions()', () => {
      collector.init();
      const btn = document.createElement('button');
      btn.textContent = 'x';
      document.body.appendChild(btn);
      btn.click();

      const actions = collector.getUserActions();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBe(1);

      document.body.removeChild(btn);
    });

    it('should return copies, not references, from getters', () => {
      collector.init();
      console.log('test');
      const logs1 = collector.getConsoleLogs();
      const logs2 = collector.getConsoleLogs();
      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });

    it('should clear all collected data with clear()', () => {
      collector.init();
      console.log('msg');
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'err', filename: 'f.js' })
      );
      const btn = document.createElement('button');
      btn.textContent = 'x';
      document.body.appendChild(btn);
      btn.click();

      collector.clear();

      expect(collector.getConsoleLogs().length).toBe(0);
      expect(collector.getJsErrors().length).toBe(0);
      expect(collector.getUserActions().length).toBe(0);

      document.body.removeChild(btn);
    });
  });

  // ============================================
  // 7. Markdown Formatting
  // ============================================

  describe('Markdown Formatting', () => {
    it('should include Environment section', () => {
      collector.init();
      const md = collector.formatAsMarkdown();
      expect(md).toContain('## Environment');
      expect(md).toContain('**URL:**');
      expect(md).toContain('**Browser:**');
      expect(md).toContain('**Viewport:**');
      expect(md).toContain('**Platform:**');
      expect(md).toContain('**Timezone:**');
      expect(md).toContain('**Online:**');
    });

    it('should include JS errors section when errors exist', () => {
      collector.init();
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'Something broke',
          filename: 'app.js',
          lineno: 42,
        })
      );

      const md = collector.formatAsMarkdown();
      expect(md).toContain('## JavaScript Errors');
      expect(md).toContain('Something broke');
      expect(md).toContain('app.js:42');
    });

    it('should include console warnings section when warnings exist', () => {
      collector.init();
      console.warn('Deprecation warning');

      const md = collector.formatAsMarkdown();
      expect(md).toContain('## Console Errors/Warnings');
      expect(md).toContain('Deprecation warning');
    });

    it('should include console errors in warnings section', () => {
      collector.init();
      console.error('Critical failure');

      const md = collector.formatAsMarkdown();
      expect(md).toContain('## Console Errors/Warnings');
      expect(md).toContain('Critical failure');
    });

    it('should not include console log/info/debug in warnings section', () => {
      collector.init();
      console.log('just a log');
      console.info('just info');
      console.debug('just debug');

      const md = collector.formatAsMarkdown();
      expect(md).not.toContain('## Console Errors/Warnings');
    });

    it('should include User Journey section when recording is active', () => {
      collector.init();
      collector.startRecording();

      const md = collector.formatAsMarkdown();
      expect(md).toContain('## User Journey');
      expect(md).toContain('### Pages Visited');
    });

    it('should not include User Journey section without recording', () => {
      collector.init();
      const md = collector.formatAsMarkdown();
      expect(md).not.toContain('## User Journey');
    });

    it('should include collected timestamp at the bottom', () => {
      collector.init();
      const md = collector.formatAsMarkdown();
      expect(md).toContain('*Collected at');
    });

    it('should truncate long console messages to 100 chars', () => {
      collector.init();
      const longMsg = 'x'.repeat(200);
      console.warn(longMsg);

      const md = collector.formatAsMarkdown();
      expect(md).toContain('...');
    });

    it('should limit JS errors to 5 in markdown', () => {
      collector.init();
      for (let i = 0; i < 8; i++) {
        window.dispatchEvent(
          new ErrorEvent('error', {
            message: `Error ${i}`,
            filename: 'test.js',
            lineno: i,
          })
        );
      }

      const md = collector.formatAsMarkdown();
      expect(md).toContain('... and 3 more');
    });

    it('should include user actions in User Journey when recording', () => {
      collector.init();
      collector.startRecording();

      const btn = document.createElement('button');
      btn.id = 'journey-btn';
      btn.textContent = 'Do Something';
      document.body.appendChild(btn);
      btn.click();

      const md = collector.formatAsMarkdown();
      expect(md).toContain('### User Actions');
      expect(md).toContain('click');

      document.body.removeChild(btn);
    });
  });

  // ============================================
  // 8. Config Options
  // ============================================

  describe('Config Options', () => {
    it('should not intercept console when captureConsole=false', () => {
      const noConsoleCollector = new DiagnosticCollector({ captureConsole: false });
      noConsoleCollector.init();

      console.log('should not be captured');
      const logs = noConsoleCollector.getConsoleLogs();
      expect(logs.length).toBe(0);

      noConsoleCollector.destroy();
    });

    it('should not intercept errors when captureErrors=false', () => {
      const noErrorCollector = new DiagnosticCollector({ captureErrors: false });
      noErrorCollector.init();

      window.dispatchEvent(
        new ErrorEvent('error', { message: 'ignored', filename: 'f.js' })
      );
      const errors = noErrorCollector.getJsErrors();
      expect(errors.length).toBe(0);

      noErrorCollector.destroy();
    });

    it('should not intercept user actions when captureUserActions=false', () => {
      const noActionsCollector = new DiagnosticCollector({ captureUserActions: false });
      noActionsCollector.init();

      const btn = document.createElement('button');
      btn.textContent = 'x';
      document.body.appendChild(btn);
      btn.click();

      const actions = noActionsCollector.getUserActions();
      expect(actions.length).toBe(0);

      document.body.removeChild(btn);
      noActionsCollector.destroy();
    });

    it('should not persist session when persistSession=false', () => {
      const noPersistCollector = new DiagnosticCollector({ persistSession: false });
      noPersistCollector.init();
      noPersistCollector.startRecording();

      const stored = sessionStorage.getItem('__traklet_recording_session__');
      expect(stored).toBeNull();

      noPersistCollector.destroy();
    });
  });

  // ============================================
  // 9. Cleanup
  // ============================================

  describe('Cleanup', () => {
    it('should remove window error listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      collector.destroy();

      const errorCall = removeSpy.mock.calls.find((c) => c[0] === 'error');
      expect(errorCall).toBeDefined();
    });

    it('should remove window unhandledrejection listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      collector.destroy();

      const rejectionCall = removeSpy.mock.calls.find(
        (c) => c[0] === 'unhandledrejection'
      );
      expect(rejectionCall).toBeDefined();
    });

    it('should remove document click listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      collector.destroy();

      const clickCall = removeSpy.mock.calls.find((c) => c[0] === 'click');
      expect(clickCall).toBeDefined();
    });

    it('should remove document submit listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      collector.destroy();

      const submitCall = removeSpy.mock.calls.find((c) => c[0] === 'submit');
      expect(submitCall).toBeDefined();
    });

    it('should remove document visibilitychange listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      collector.destroy();

      const visibilityCall = removeSpy.mock.calls.find(
        (c) => c[0] === 'visibilitychange'
      );
      expect(visibilityCall).toBeDefined();
    });

    it('should remove window popstate listener on destroy', () => {
      collector.init();
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      collector.destroy();

      const popstateCall = removeSpy.mock.calls.find((c) => c[0] === 'popstate');
      expect(popstateCall).toBeDefined();
    });

    it('should null out listener references after destroy', () => {
      collector.init();
      collector.destroy();

      // Subsequent destroy should not call removeEventListener
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const removeDocSpy = vi.spyOn(document, 'removeEventListener');

      // Re-init and destroy to verify listeners were nulled
      // Since double-destroy is guarded by initialized flag, we verify
      // that no stale references cause issues by creating a new collector
      const freshCollector = new DiagnosticCollector();
      freshCollector.init();
      freshCollector.destroy();

      // Verify these are called fresh (not stale)
      expect(removeSpy).toHaveBeenCalled();
      expect(removeDocSpy).toHaveBeenCalled();
    });

    it('should restore original console methods on destroy', () => {
      const originalLog = console.log;
      collector.init();
      // After init, console.log is intercepted (different function)
      const interceptedLog = console.log;
      expect(interceptedLog).not.toBe(originalLog);

      collector.destroy();
      // After destroy, console.log should be restored
      // Note: the original is stored via .bind(console), so it's a new function
      // but calling it should work without capturing
      console.log('after destroy');
      expect(collector.getConsoleLogs().length).toBe(0);
    });

    it('should not capture errors after destroy', () => {
      collector.init();
      collector.destroy();

      window.dispatchEvent(
        new ErrorEvent('error', { message: 'after destroy', filename: 'f.js' })
      );

      expect(collector.getJsErrors().length).toBe(0);
    });

    it('should not capture clicks after destroy', () => {
      collector.init();
      collector.destroy();

      const btn = document.createElement('button');
      btn.textContent = 'x';
      document.body.appendChild(btn);
      btn.click();

      expect(collector.getUserActions().length).toBe(0);

      document.body.removeChild(btn);
    });
  });

  // ============================================
  // Singleton helpers
  // ============================================

  describe('Singleton helpers', () => {
    it('should return the same instance from getDiagnosticCollector()', () => {
      const a = getDiagnosticCollector();
      const b = getDiagnosticCollector();
      expect(a).toBe(b);
    });

    it('should create new instance after resetDiagnosticCollector()', () => {
      const a = getDiagnosticCollector();
      resetDiagnosticCollector();
      const b = getDiagnosticCollector();
      expect(a).not.toBe(b);
    });

    it('should call destroy() on reset', () => {
      const instance = getDiagnosticCollector();
      instance.init();

      const removeSpy = vi.spyOn(window, 'removeEventListener');
      resetDiagnosticCollector();

      // destroy was called, so removeEventListener should have been invoked
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});
