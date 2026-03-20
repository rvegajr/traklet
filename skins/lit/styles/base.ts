/**
 * Base styles for Traklet Lit skin
 * Uses CSS custom properties for theming
 */

import { css } from 'lit';

export const baseStyles = css`
  :host {
    /* Color tokens */
    --traklet-bg: var(--traklet-bg-override, #ffffff);
    --traklet-bg-secondary: var(--traklet-bg-secondary-override, #f6f8fa);
    --traklet-bg-hover: var(--traklet-bg-hover-override, #f0f2f5);
    --traklet-text: var(--traklet-text-override, #24292f);
    --traklet-text-secondary: var(--traklet-text-secondary-override, #57606a);
    --traklet-text-muted: var(--traklet-text-muted-override, #8b949e);
    --traklet-border: var(--traklet-border-override, #d0d7de);
    --traklet-border-muted: var(--traklet-border-muted-override, #e6e8eb);

    /* Brand colors */
    --traklet-primary: var(--traklet-primary-override, #0969da);
    --traklet-primary-hover: var(--traklet-primary-hover-override, #0860ca);
    --traklet-success: var(--traklet-success-override, #1a7f37);
    --traklet-warning: var(--traklet-warning-override, #9a6700);
    --traklet-danger: var(--traklet-danger-override, #cf222e);

    /* State colors */
    --traklet-open: var(--traklet-open-override, #1a7f37);
    --traklet-closed: var(--traklet-closed-override, #8250df);

    /* Spacing */
    --traklet-space-xs: 4px;
    --traklet-space-sm: 8px;
    --traklet-space-md: 12px;
    --traklet-space-lg: 24px;
    --traklet-space-xl: 32px;

    /* Typography */
    --traklet-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica,
      Arial, sans-serif;
    --traklet-font-size-xs: 12px;
    --traklet-font-size-sm: 14px;
    --traklet-font-size-md: 16px;
    --traklet-font-size-lg: 20px;
    --traklet-font-size-xl: 24px;
    --traklet-line-height: 1.5;

    /* Border radius */
    --traklet-radius-sm: 4px;
    --traklet-radius-md: 6px;
    --traklet-radius-lg: 8px;
    --traklet-radius-full: 9999px;

    /* Shadows */
    --traklet-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --traklet-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    --traklet-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

    /* Transitions */
    --traklet-transition-fast: 150ms ease;
    --traklet-transition-normal: 200ms ease;

    /* Apply base styles */
    font-family: var(--traklet-font-family);
    font-size: var(--traklet-font-size-sm);
    line-height: var(--traklet-line-height);
    color: var(--traklet-text);
    box-sizing: border-box;
  }

  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  /* Reset */
  button {
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  a {
    color: var(--traklet-primary);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const buttonStyles = css`
  .traklet-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--traklet-space-xs);
    padding: var(--traklet-space-sm) var(--traklet-space-md);
    font-size: var(--traklet-font-size-sm);
    font-weight: 500;
    border-radius: var(--traklet-radius-md);
    transition: all var(--traklet-transition-fast);
    cursor: pointer;
    white-space: nowrap;
  }

  .traklet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .traklet-btn--primary {
    background: var(--traklet-primary);
    color: white;
    border: 1px solid var(--traklet-primary);
  }

  .traklet-btn--primary:hover:not(:disabled) {
    background: var(--traklet-primary-hover);
    border-color: var(--traklet-primary-hover);
  }

  .traklet-btn--secondary {
    background: var(--traklet-bg);
    color: var(--traklet-text);
    border: 1px solid var(--traklet-border);
  }

  .traklet-btn--secondary:hover:not(:disabled) {
    background: var(--traklet-bg-hover);
  }

  .traklet-btn--danger {
    background: var(--traklet-danger);
    color: white;
    border: 1px solid var(--traklet-danger);
  }

  .traklet-btn--danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .traklet-btn--ghost {
    background: transparent;
    color: var(--traklet-text-secondary);
    border: 1px solid transparent;
  }

  .traklet-btn--ghost:hover:not(:disabled) {
    background: var(--traklet-bg-hover);
    color: var(--traklet-text);
  }

  .traklet-btn--sm {
    padding: var(--traklet-space-xs) var(--traklet-space-sm);
    font-size: var(--traklet-font-size-xs);
  }

  .traklet-btn--lg {
    padding: var(--traklet-space-md) var(--traklet-space-lg);
    font-size: var(--traklet-font-size-md);
  }

  .traklet-btn--icon {
    padding: var(--traklet-space-sm);
    border-radius: var(--traklet-radius-sm);
  }
`;

export const formStyles = css`
  .traklet-input {
    width: 100%;
    padding: var(--traklet-space-sm) var(--traklet-space-md);
    font-size: var(--traklet-font-size-sm);
    font-family: inherit;
    color: var(--traklet-text);
    background: var(--traklet-bg);
    border: 1px solid var(--traklet-border);
    border-radius: var(--traklet-radius-md);
    transition: border-color var(--traklet-transition-fast);
  }

  .traklet-input:focus {
    outline: none;
    border-color: var(--traklet-primary);
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
  }

  .traklet-input::placeholder {
    color: var(--traklet-text-muted);
  }

  .traklet-input--error {
    border-color: var(--traklet-danger);
  }

  .traklet-textarea {
    min-height: 100px;
    resize: vertical;
  }

  .traklet-label {
    display: block;
    margin-bottom: var(--traklet-space-xs);
    font-size: var(--traklet-font-size-sm);
    font-weight: 500;
    color: var(--traklet-text);
  }

  .traklet-error {
    margin-top: var(--traklet-space-xs);
    font-size: var(--traklet-font-size-xs);
    color: var(--traklet-danger);
  }

  .traklet-form-group {
    margin-bottom: var(--traklet-space-md);
  }
`;

export const labelStyles = css`
  .traklet-label-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    font-size: var(--traklet-font-size-xs);
    font-weight: 500;
    border-radius: var(--traklet-radius-full);
  }

  .traklet-state-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: var(--traklet-font-size-xs);
    font-weight: 500;
    border-radius: var(--traklet-radius-full);
    text-transform: capitalize;
  }

  .traklet-state-badge--open {
    background: rgba(26, 127, 55, 0.1);
    color: var(--traklet-open);
  }

  .traklet-state-badge--closed {
    background: rgba(130, 80, 223, 0.1);
    color: var(--traklet-closed);
  }
`;

export const layoutStyles = css`
  .traklet-card {
    background: var(--traklet-bg);
    border: 1px solid var(--traklet-border);
    border-radius: var(--traklet-radius-lg);
    overflow: hidden;
  }

  .traklet-card__header {
    padding: var(--traklet-space-md);
    border-bottom: 1px solid var(--traklet-border-muted);
  }

  .traklet-card__body {
    padding: var(--traklet-space-md);
  }

  .traklet-card__footer {
    padding: var(--traklet-space-md);
    border-top: 1px solid var(--traklet-border-muted);
    background: var(--traklet-bg-secondary);
  }

  .traklet-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--traklet-space-xl);
    text-align: center;
    color: var(--traklet-text-secondary);
  }

  .traklet-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--traklet-space-xl);
  }

  .traklet-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--traklet-border);
    border-top-color: var(--traklet-primary);
    border-radius: 50%;
    animation: traklet-spin 0.8s linear infinite;
  }

  @keyframes traklet-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
