/**
 * Core Backend Adapter Interface
 * Composes ISP interfaces for adapters that support full functionality
 */

import type { IIssueReader } from './IIssueReader';
import type { IIssueWriter } from './IIssueWriter';
import type { ICapabilityProvider } from './ICapabilityProvider';
import type { Project } from '@/models';

export type AdapterType = 'github' | 'azure-devops' | 'rest' | 'localStorage';

export interface AdapterConfig {
  /** Adapter type identifier */
  readonly type: AdapterType;

  /** Authentication token */
  readonly token?: string | undefined;

  /** Token retrieval callback for dynamic tokens */
  readonly getToken?: (() => Promise<string>) | undefined;

  /** Base URL for API (required for REST adapter) */
  readonly baseUrl?: string | undefined;

  /** Projects to manage */
  readonly projects: readonly ProjectConfig[];

  /** Additional adapter-specific options */
  readonly options?: Readonly<Record<string, unknown>> | undefined;
}

export interface ProjectConfig {
  /** Unique project identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Backend-specific identifier (e.g., "owner/repo" for GitHub). Defaults to id if not provided. */
  readonly identifier?: string | undefined;

  /** Project description */
  readonly description?: string | undefined;
}

export interface ConnectionResult {
  readonly success: boolean;
  readonly error?: string | undefined;
  readonly projects?: readonly Project[] | undefined;
  /** The authenticated user identity (auto-detected from the backend) */
  readonly authenticatedUser?: {
    readonly email: string;
    readonly name: string;
    readonly id?: string | undefined;
    readonly avatarUrl?: string | undefined;
  } | undefined;
}

/**
 * Base adapter interface - required for all adapters
 * Extends IIssueReader and IIssueWriter as core functionality
 */
export interface IBackendAdapter extends IIssueReader, IIssueWriter, ICapabilityProvider {
  /** Adapter type identifier */
  readonly type: AdapterType;

  /**
   * Initialize connection to the backend
   */
  connect(config: AdapterConfig): Promise<ConnectionResult>;

  /**
   * Disconnect from the backend
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected
   */
  isConnected(): boolean;

  /**
   * Get the current authentication token
   */
  getToken(): Promise<string | undefined>;

  /**
   * Validate that the token has required permissions
   */
  validateToken(): Promise<boolean>;
}

/**
 * Type guard to check if adapter implements optional interfaces
 */
export function adapterHasCapability<T>(
  adapter: IBackendAdapter,
  capability: keyof T
): adapter is IBackendAdapter & T {
  return capability in adapter && typeof (adapter as unknown as T)[capability] === 'function';
}
