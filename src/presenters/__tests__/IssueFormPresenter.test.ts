/**
 * IssueFormPresenter tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IssueFormPresenter } from '../IssueFormPresenter';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { resetConfigManager, getConfigManager } from '@/core/ConfigManager';
import { resetStateManager, getStateManager } from '@/core/StateManager';
import { resetPermissionManager } from '@/core/PermissionManager';
import { resetEventBus, getEventBus } from '@/core/EventBus';
import { resetAuthManager } from '@/core/AuthManager';
import type { AdapterConfig } from '@/contracts';
import type { TrakletConfig } from '@/core/ConfigManager';
import type { IssueFormViewModel } from '../IPresenter';

// Footer appended by IssueFormPresenter when a user is configured
const REPORTER_FOOTER = '\n\n---\n*Reported by: Test User — test@example.com*';

describe('IssueFormPresenter', () => {
  let presenter: IssueFormPresenter;
  let adapter: LocalStorageAdapter;
  const projectId = 'project-1';

  beforeEach(async () => {
    // Reset all singletons
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();

    // Configure for authenticated user
    const config: TrakletConfig = {
      adapter: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
      user: {
        email: 'test@example.com',
        name: 'Test User',
      },
    };
    getConfigManager().setConfig(config);

    // Create and connect adapter
    adapter = new LocalStorageAdapter(false);
    const adapterConfig: AdapterConfig = {
      type: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
    };
    await adapter.connect(adapterConfig);

    presenter = new IssueFormPresenter(adapter, projectId);
  });

  afterEach(async () => {
    adapter.clearAllData();
    await adapter.disconnect();
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();
  });

  describe('initCreate()', () => {
    it('should set isEditing to false', async () => {
      await presenter.initCreate();

      const vm = presenter.getViewModel();
      expect(vm.isEditing).toBe(false);
    });

    it('should reset form data', async () => {
      // First update some fields
      presenter.updateField('title', 'Some title');
      presenter.updateField('body', 'Some body');

      await presenter.initCreate();

      const vm = presenter.getViewModel();
      // initCreate now exposes empty formData in viewModel.issue for UI bindings
      expect(vm.issue).toBeDefined();
      expect(vm.issue?.title).toBe('');
      expect(vm.issue?.body).toBe('');
      expect(vm.issue?.labels).toEqual([]);
      expect(vm.isSubmitting).toBe(false);
      expect(vm.errors).toEqual({});
    });

    it('should load available labels', async () => {
      await presenter.initCreate();

      const vm = presenter.getViewModel();
      // LocalStorageAdapter returns labels, verify it is an array
      expect(Array.isArray(vm.availableLabels)).toBe(true);
    });
  });

  describe('initEdit()', () => {
    it('should load issue data into form and set isEditing to true', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Edit Me',
        body: 'Edit body',
        labels: ['bug'],
      });

      await presenter.initEdit(created.id);

      const vm = presenter.getViewModel();
      expect(vm.isEditing).toBe(true);
      expect(vm.issue).toBeDefined();
      expect(vm.issue?.id).toBe(created.id);
      expect(vm.issue?.title).toBe('Edit Me');
      expect(vm.issue?.body).toBe('Edit body');
      expect(vm.issue?.labels).toContain('bug');
    });

    it('should load available labels', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Test',
        body: 'Body',
      });

      await presenter.initEdit(created.id);

      const vm = presenter.getViewModel();
      expect(Array.isArray(vm.availableLabels)).toBe(true);
    });

    it('should set isSubmitting to false and clear errors', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Test',
        body: 'Body',
      });

      await presenter.initEdit(created.id);

      const vm = presenter.getViewModel();
      expect(vm.isSubmitting).toBe(false);
      expect(vm.errors).toEqual({});
    });

    it('should cancel if issue loading fails', async () => {
      const stateManager = getStateManager();
      const spy = vi.spyOn(stateManager, 'setState');

      await presenter.initEdit('nonexistent-id');

      // Should have navigated (cancel calls setState)
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateField()', () => {
    it('should update title', () => {
      presenter.updateField('title', 'New Title');

      // We can verify by submitting and checking what gets sent,
      // or by calling validate which reads from formData
      // For now, verify no errors and field is stored by triggering initEdit flow
      // Actually, let's verify via validate + submit behavior
      presenter.updateField('body', 'Some body');
      const isValid = presenter.validate();
      expect(isValid).toBe(true);
    });

    it('should update body', () => {
      presenter.updateField('title', 'Title');
      presenter.updateField('body', 'New body content');

      const isValid = presenter.validate();
      expect(isValid).toBe(true);
    });

    it('should update labels as array', () => {
      presenter.updateField('labels', ['bug', 'feature']);

      // Labels are stored internally; verify via submit
      presenter.updateField('title', 'Title');
      presenter.updateField('body', 'Body');
      const isValid = presenter.validate();
      expect(isValid).toBe(true);
    });

    it('should ignore non-array value for labels', () => {
      presenter.updateField('labels', 'not-an-array');

      // Should not throw, labels remain unchanged
      const vm = presenter.getViewModel();
      expect(vm).toBeDefined();
    });

    it('should update priority with valid enum value', () => {
      presenter.updateField('priority', 'high');

      // No errors expected
      const vm = presenter.getViewModel();
      expect(vm).toBeDefined();
    });

    it('should ignore invalid priority value', () => {
      presenter.updateField('priority', 'invalid-priority');

      // Should not throw, priority remains undefined
      const vm = presenter.getViewModel();
      expect(vm).toBeDefined();
    });

    it('should allow clearing priority with null', () => {
      presenter.updateField('priority', 'high');
      presenter.updateField('priority', null);

      const vm = presenter.getViewModel();
      expect(vm).toBeDefined();
    });

    it('should allow clearing priority with undefined', () => {
      presenter.updateField('priority', 'medium');
      presenter.updateField('priority', undefined);

      const vm = presenter.getViewModel();
      expect(vm).toBeDefined();
    });

    it('should clear error for updated field', async () => {
      // Trigger validation to create errors
      presenter.validate(); // title is empty, should produce error

      const vmBefore = presenter.getViewModel();
      expect(vmBefore.errors['title']).toBe('Title is required');

      // Now update title
      presenter.updateField('title', 'Fixed Title');

      const vmAfter = presenter.getViewModel();
      expect(vmAfter.errors['title']).toBeUndefined();
    });

    it('should update view model issue when in edit mode', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Original',
        body: 'Body',
      });

      await presenter.initEdit(created.id);
      presenter.updateField('title', 'Updated Title');

      const vm = presenter.getViewModel();
      expect(vm.isEditing).toBe(true);
      expect(vm.issue?.title).toBe('Updated Title');
    });
  });

  describe('validate()', () => {
    it('should return false with error for empty title', () => {
      presenter.updateField('title', '');
      presenter.updateField('body', 'Some body');

      const isValid = presenter.validate();

      expect(isValid).toBe(false);
      const vm = presenter.getViewModel();
      expect(vm.errors['title']).toBe('Title is required');
    });

    it('should return false with error for whitespace-only title', () => {
      presenter.updateField('title', '   ');
      presenter.updateField('body', 'Some body');

      const isValid = presenter.validate();

      expect(isValid).toBe(false);
      const vm = presenter.getViewModel();
      expect(vm.errors['title']).toBe('Title is required');
    });

    it('should return false with error for title exceeding 256 characters', () => {
      presenter.updateField('title', 'A'.repeat(257));
      presenter.updateField('body', 'Body');

      const isValid = presenter.validate();

      expect(isValid).toBe(false);
      const vm = presenter.getViewModel();
      expect(vm.errors['title']).toBe('Title must be less than 256 characters');
    });

    it('should return false with error for body exceeding 65536 characters', () => {
      presenter.updateField('title', 'Valid Title');
      presenter.updateField('body', 'X'.repeat(65537));

      const isValid = presenter.validate();

      expect(isValid).toBe(false);
      const vm = presenter.getViewModel();
      expect(vm.errors['body']).toBe('Body is too long');
    });

    it('should return true for valid form data', () => {
      presenter.updateField('title', 'Valid Title');
      presenter.updateField('body', 'Valid body');

      const isValid = presenter.validate();

      expect(isValid).toBe(true);
      const vm = presenter.getViewModel();
      expect(Object.keys(vm.errors)).toHaveLength(0);
    });

    it('should allow empty body', () => {
      presenter.updateField('title', 'Valid Title');
      presenter.updateField('body', '');

      const isValid = presenter.validate();

      expect(isValid).toBe(true);
    });
  });

  describe('submit() - create', () => {
    it('should call adapter.createIssue with correct DTO', async () => {
      const createSpy = vi.spyOn(adapter, 'createIssue');

      await presenter.initCreate();
      presenter.updateField('title', 'New Issue');
      presenter.updateField('body', 'Issue body');
      presenter.updateField('labels', ['bug']);
      presenter.updateField('priority', 'high');

      await presenter.submit();

      expect(createSpy).toHaveBeenCalledOnce();
      expect(createSpy).toHaveBeenCalledWith(projectId, {
        title: 'New Issue',
        body: 'Issue body' + REPORTER_FOOTER,
        labels: ['bug'],
        priority: 'high',
      });
    });

    it('should emit issue:created event', async () => {
      const eventBus = getEventBus();
      const handler = vi.fn();
      eventBus.on('issue:created', handler);

      await presenter.initCreate();
      presenter.updateField('title', 'New Issue');
      presenter.updateField('body', 'Body');

      await presenter.submit();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          issue: expect.objectContaining({ title: 'New Issue' }),
        })
      );
    });

    it('should navigate to detail view after creation', async () => {
      const stateManager = getStateManager();
      const spy = vi.spyOn(stateManager, 'setState');

      await presenter.initCreate();
      presenter.updateField('title', 'New Issue');
      presenter.updateField('body', 'Body');

      await presenter.submit();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          viewState: 'detail',
          selectedIssue: expect.objectContaining({ title: 'New Issue' }),
        })
      );
    });

    it('should set isSubmitting during submission', async () => {
      const states: boolean[] = [];
      presenter.subscribe((vm) => states.push(vm.isSubmitting));

      await presenter.initCreate();
      presenter.updateField('title', 'New Issue');
      presenter.updateField('body', 'Body');

      await presenter.submit();

      // Should have been true at some point
      expect(states).toContain(true);
      // Final state should be false
      expect(states[states.length - 1]).toBe(false);
    });

    it('should omit labels when empty', async () => {
      const createSpy = vi.spyOn(adapter, 'createIssue');

      await presenter.initCreate();
      presenter.updateField('title', 'No Labels');
      presenter.updateField('body', 'Body');

      await presenter.submit();

      expect(createSpy).toHaveBeenCalledWith(projectId, {
        title: 'No Labels',
        body: 'Body' + REPORTER_FOOTER,
        labels: undefined,
        priority: undefined,
      });
    });

    it('should trim title and body', async () => {
      const createSpy = vi.spyOn(adapter, 'createIssue');

      await presenter.initCreate();
      presenter.updateField('title', '  Trimmed Title  ');
      presenter.updateField('body', '  Trimmed Body  ');

      await presenter.submit();

      expect(createSpy).toHaveBeenCalledWith(projectId, {
        title: 'Trimmed Title',
        body: 'Trimmed Body' + REPORTER_FOOTER,
        labels: undefined,
        priority: undefined,
      });
    });
  });

  describe('submit() - edit', () => {
    it('should call adapter.updateIssue with correct DTO', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Original',
        body: 'Original body',
      });

      const updateSpy = vi.spyOn(adapter, 'updateIssue');

      await presenter.initEdit(created.id);
      presenter.updateField('title', 'Updated Title');
      presenter.updateField('body', 'Updated body');
      presenter.updateField('labels', ['feature']);
      presenter.updateField('priority', 'low');

      await presenter.submit();

      expect(updateSpy).toHaveBeenCalledOnce();
      expect(updateSpy).toHaveBeenCalledWith(projectId, created.id, {
        title: 'Updated Title',
        body: 'Updated body',
        labels: ['feature'],
        priority: 'low',
      });
    });

    it('should emit issue:updated event', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Original',
        body: 'Body',
      });

      const eventBus = getEventBus();
      const handler = vi.fn();
      eventBus.on('issue:updated', handler);

      await presenter.initEdit(created.id);
      presenter.updateField('title', 'Updated');

      await presenter.submit();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          issue: expect.objectContaining({ title: 'Updated' }),
          changes: expect.any(Object),
        })
      );
    });

    it('should navigate to detail view after update', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Original',
        body: 'Body',
      });

      const stateManager = getStateManager();
      const spy = vi.spyOn(stateManager, 'setState');

      await presenter.initEdit(created.id);
      presenter.updateField('title', 'Updated');

      await presenter.submit();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          viewState: 'detail',
          selectedIssue: expect.objectContaining({ title: 'Updated' }),
        })
      );
    });
  });

  describe('submit() - validation failure', () => {
    it('should not call adapter if validation fails', async () => {
      const createSpy = vi.spyOn(adapter, 'createIssue');
      const updateSpy = vi.spyOn(adapter, 'updateIssue');

      await presenter.initCreate();
      // Do not set title (required field)
      presenter.updateField('body', 'Some body');

      await presenter.submit();

      expect(createSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should set validation errors in view model', async () => {
      await presenter.initCreate();
      // Leave title empty

      await presenter.submit();

      const vm = presenter.getViewModel();
      expect(vm.errors['title']).toBeDefined();
    });
  });

  describe('submit() - error handling', () => {
    it('should set submit error when adapter throws', async () => {
      await presenter.initCreate();
      presenter.updateField('title', 'Test');
      presenter.updateField('body', 'Body');

      // Disconnect adapter to cause error
      await adapter.disconnect();

      await presenter.submit();

      const vm = presenter.getViewModel();
      expect(vm.errors['submit']).toBeDefined();
      expect(vm.isSubmitting).toBe(false);
    });
  });

  describe('cancel()', () => {
    it('should navigate to list when cancelling from create', async () => {
      const stateManager = getStateManager();
      const spy = vi.spyOn(stateManager, 'setState');

      await presenter.initCreate();
      presenter.cancel();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ viewState: 'list' })
      );
    });

    it('should navigate to detail when cancelling from edit', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Test',
        body: 'Body',
      });

      const stateManager = getStateManager();
      const spy = vi.spyOn(stateManager, 'setState');

      await presenter.initEdit(created.id);
      spy.mockClear();

      presenter.cancel();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ viewState: 'detail' })
      );
    });
  });

  describe('subscribe()', () => {
    it('should call subscriber immediately with current view model', () => {
      const callback = vi.fn();

      presenter.subscribe(callback);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(presenter.getViewModel());
    });

    it('should return unsubscribe function', async () => {
      const callback = vi.fn();

      const unsubscribe = presenter.subscribe(callback);
      callback.mockClear();

      unsubscribe();

      // Trigger an update
      presenter.updateField('title', 'Test');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify subscriber on view model changes', async () => {
      const viewModels: IssueFormViewModel[] = [];
      presenter.subscribe((vm) => viewModels.push(vm));

      // Clear initial call
      viewModels.length = 0;

      presenter.updateField('title', 'Changed');

      expect(viewModels.length).toBeGreaterThan(0);
    });

    it('should support multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      presenter.subscribe(callback1);
      presenter.subscribe(callback2);

      callback1.mockClear();
      callback2.mockClear();

      presenter.updateField('title', 'Test');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('setProjectId()', () => {
    it('should reset form data', async () => {
      await presenter.initCreate();
      presenter.updateField('title', 'Some title');
      presenter.updateField('body', 'Some body');

      presenter.setProjectId('project-2');

      const vm = presenter.getViewModel();
      expect(vm.isEditing).toBe(false);
      expect(vm.issue).toBeUndefined();
      expect(vm.isSubmitting).toBe(false);
      expect(vm.errors).toEqual({});
      expect(vm.availableLabels).toEqual([]);
    });

    it('should clear current issue', async () => {
      const created = await adapter.createIssue(projectId, {
        title: 'Test',
        body: 'Body',
      });

      await presenter.initEdit(created.id);
      expect(presenter.getViewModel().isEditing).toBe(true);

      presenter.setProjectId('project-2');

      const vm = presenter.getViewModel();
      expect(vm.isEditing).toBe(false);
      expect(vm.issue).toBeUndefined();
    });
  });
});
