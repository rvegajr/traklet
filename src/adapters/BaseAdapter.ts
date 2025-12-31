/**
 * BaseAdapter - Abstract base class for all backend adapters
 * Provides common functionality and enforces ISP interface compliance
 */

import type {
  IBackendAdapter,
  AdapterConfig,
  AdapterType,
  ConnectionResult,
  AdapterCapabilities,
  ICapabilityProvider,
} from '@/contracts';
import { DEFAULT_CAPABILITIES } from '@/contracts';
import type {
  Issue,
  IssueQuery,
  PaginatedResult,
  CreateIssueDTO,
  UpdateIssueDTO,
} from '@/models';

export abstract class BaseAdapter implements IBackendAdapter, ICapabilityProvider {
  abstract readonly type: AdapterType;

  protected config: AdapterConfig | null = null;
  protected connected = false;
  protected capabilities: AdapterCapabilities = { ...DEFAULT_CAPABILITIES };

  /**
   * Initialize connection to the backend
   */
  async connect(config: AdapterConfig): Promise<ConnectionResult> {
    this.config = config;

    try {
      const result = await this.doConnect(config);
      if (result.success) {
        this.connected = true;
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Disconnect from the backend
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.doDisconnect();
      this.connected = false;
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the current authentication token
   */
  async getToken(): Promise<string | undefined> {
    if (!this.config) return undefined;

    if (this.config.token) {
      return this.config.token;
    }

    if (this.config.getToken) {
      return this.config.getToken();
    }

    return undefined;
  }

  /**
   * Validate that the token has required permissions
   */
  async validateToken(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    return this.doValidateToken(token);
  }

  /**
   * Get adapter capabilities
   */
  getCapabilities(): AdapterCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if a specific capability is supported
   */
  hasCapability(capability: keyof AdapterCapabilities): boolean {
    const value = this.capabilities[capability];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return false;
  }

  /**
   * Ensure adapter is connected before operations
   */
  protected ensureConnected(): void {
    if (!this.connected || !this.config) {
      throw new Error('Adapter is not connected. Call connect() first.');
    }
  }

  /**
   * Get project ID or throw if not found
   */
  protected getProjectConfig(projectId: string) {
    this.ensureConnected();
    const project = this.config?.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  // Abstract methods to be implemented by subclasses

  /**
   * Perform the actual connection logic
   */
  protected abstract doConnect(config: AdapterConfig): Promise<ConnectionResult>;

  /**
   * Perform the actual disconnection logic
   */
  protected abstract doDisconnect(): Promise<void>;

  /**
   * Validate the token with the backend
   */
  protected abstract doValidateToken(token: string): Promise<boolean>;

  // IIssueReader methods
  abstract getIssues(projectId: string, query?: IssueQuery): Promise<PaginatedResult<Issue>>;
  abstract getIssue(projectId: string, issueId: string): Promise<Issue>;
  abstract issueExists(projectId: string, issueId: string): Promise<boolean>;

  // IIssueWriter methods
  abstract createIssue(projectId: string, dto: CreateIssueDTO): Promise<Issue>;
  abstract updateIssue(projectId: string, issueId: string, dto: UpdateIssueDTO): Promise<Issue>;
}
