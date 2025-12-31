/**
 * ConfigManager - Configuration handling and validation
 * Uses Zod for runtime validation of configuration
 */

import { z } from 'zod';
import type { AdapterType, ProjectConfig } from '@/contracts';

/** User identity for permission matching */
export interface TrakletUser {
  readonly email: string;
  readonly name?: string | undefined;
  readonly displayName?: string | undefined;
  readonly avatar?: string | undefined;
  readonly avatarUrl?: string | undefined;
  readonly id?: string | undefined;
  readonly username?: string | undefined;
}

/** Anonymous mode options */
export type AnonymousMode = 'view_only' | 'view_create';

/** Permission configuration */
export interface PermissionConfig {
  readonly anonymousMode?: AnonymousMode | undefined;
}

/** Theme configuration */
export interface ThemeConfig {
  readonly preset?: 'light' | 'dark' | 'auto' | undefined;
  readonly customProperties?: Readonly<Record<string, string>> | undefined;
}

/** Position configuration - can be string shorthand or object */
export type PositionConfig =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | {
      readonly placement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | undefined;
      readonly offsetX?: number | undefined;
      readonly offsetY?: number | undefined;
    };

/** Complete Traklet configuration */
export interface TrakletConfig {
  /** Adapter type or custom adapter constructor */
  readonly adapter: AdapterType;

  /** Authentication token (optional if using getToken) */
  readonly token?: string | undefined;

  /** Dynamic token retrieval */
  readonly getToken?: (() => Promise<string>) | undefined;

  /** API base URL (required for REST adapter) */
  readonly baseUrl?: string | undefined;

  /** Projects to manage */
  readonly projects: readonly ProjectConfig[];

  /** Current user identity (optional - enables permissions) */
  readonly user?: TrakletUser | undefined;

  /** Permission settings */
  readonly permissions?: PermissionConfig | undefined;

  /** Theme settings */
  readonly theme?: ThemeConfig | undefined;

  /** Position settings */
  readonly position?: PositionConfig | undefined;

  /** Enable offline support */
  readonly offlineEnabled?: boolean | undefined;

  /** Enable debug mode */
  readonly debug?: boolean | undefined;

  /** Custom container element (default: document.body) */
  readonly container?: HTMLElement | undefined;

  /** Collect diagnostic info (console logs, errors, environment) - default: true */
  readonly collectDiagnostics?: boolean | undefined;
}

// Zod schemas for validation
const ProjectConfigSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Project name is required'),
  identifier: z.string().optional(),
  description: z.string().optional(),
});

const UserSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'User name is required').optional(),
  displayName: z.string().optional(),
  avatar: z.string().url().optional(),
  avatarUrl: z.string().url().optional(),
  id: z.string().optional(),
  username: z.string().optional(),
}).refine(data => data.name || data.displayName, {
  message: 'Either name or displayName is required',
});

const PermissionConfigSchema = z.object({
  anonymousMode: z.enum(['view_only', 'view_create']).optional(),
});

const ThemeConfigSchema = z.object({
  preset: z.enum(['light', 'dark', 'auto']).optional(),
  customProperties: z.record(z.string()).optional(),
});

const PositionConfigObjectSchema = z.object({
  placement: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
});

// Accept both string shorthand and object
const PositionConfigSchema = z.union([
  z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  PositionConfigObjectSchema,
]);

const TrakletConfigSchema = z
  .object({
    adapter: z.enum(['github', 'azure-devops', 'rest', 'localStorage']),
    token: z.string().optional(),
    getToken: z.function().returns(z.promise(z.string())).optional(),
    baseUrl: z.string().url().optional(),
    projects: z.array(ProjectConfigSchema).min(1, 'At least one project is required'),
    user: UserSchema.optional(),
    permissions: PermissionConfigSchema.optional(),
    theme: ThemeConfigSchema.optional(),
    position: PositionConfigSchema.optional(),
    offlineEnabled: z.boolean().optional(),
    debug: z.boolean().optional(),
    // container is not validated as it's a DOM element
  })
  .refine(
    (config) => {
      // localStorage doesn't need authentication
      if (config.adapter === 'localStorage') return true;
      return config.token !== undefined || config.getToken !== undefined;
    },
    {
      message: 'Either token or getToken must be provided for remote adapters',
    }
  )
  .refine(
    (config) => {
      if (config.adapter === 'rest') {
        return config.baseUrl !== undefined;
      }
      return true;
    },
    {
      message: 'baseUrl is required for REST adapter',
    }
  );

export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly config?: TrakletConfig | undefined;
}

export class ConfigManager {
  private config: TrakletConfig | null = null;

  /**
   * Validate and store configuration
   */
  setConfig(config: TrakletConfig): ConfigValidationResult {
    const result = TrakletConfigSchema.safeParse(config);

    if (!result.success) {
      const errors = result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return { valid: false, errors };
    }

    this.config = config;
    return { valid: true, errors: [], config };
  }

  /**
   * Get current configuration
   */
  getConfig(): TrakletConfig | null {
    return this.config;
  }

  /**
   * Get a specific config value with default
   */
  get<K extends keyof TrakletConfig>(key: K, defaultValue: TrakletConfig[K]): TrakletConfig[K] {
    if (!this.config) return defaultValue;
    return this.config[key] ?? defaultValue;
  }

  /**
   * Check if a user is configured (enables permissions)
   */
  hasUser(): boolean {
    return this.config?.user !== undefined;
  }

  /**
   * Get the current user
   */
  getUser(): TrakletUser | undefined {
    return this.config?.user;
  }

  /**
   * Get anonymous mode setting
   */
  getAnonymousMode(): AnonymousMode | undefined {
    return this.config?.permissions?.anonymousMode;
  }

  /**
   * Check if offline support is enabled
   */
  isOfflineEnabled(): boolean {
    return this.config?.offlineEnabled ?? true;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugEnabled(): boolean {
    return this.config?.debug ?? false;
  }

  /**
   * Get the configured projects
   */
  getProjects(): readonly ProjectConfig[] {
    return this.config?.projects ?? [];
  }

  /**
   * Get theme configuration
   */
  getTheme(): ThemeConfig {
    return this.config?.theme ?? { preset: 'auto' };
  }

  /**
   * Get position configuration (normalized to object form)
   */
  getPosition(): { placement: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; offsetX?: number | undefined; offsetY?: number | undefined } {
    const pos = this.config?.position;
    if (!pos) return { placement: 'bottom-right' };
    if (typeof pos === 'string') return { placement: pos };
    const result: { placement: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; offsetX?: number | undefined; offsetY?: number | undefined } = {
      placement: pos.placement ?? 'bottom-right',
    };
    if (pos.offsetX !== undefined) result.offsetX = pos.offsetX;
    if (pos.offsetY !== undefined) result.offsetY = pos.offsetY;
    return result;
  }

  /**
   * Clear configuration
   */
  clear(): void {
    this.config = null;
  }
}

// Singleton
let globalConfigManager: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager();
  }
  return globalConfigManager;
}

export function resetConfigManager(): void {
  if (globalConfigManager) {
    globalConfigManager.clear();
  }
  globalConfigManager = null;
}
