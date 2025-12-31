/**
 * TrakletBuilder - Wizard-driven configuration builder
 * Provides a fluent API for configuring Traklet with full validation
 */

import { z } from 'zod';
import type { TrakletConfig, TrakletUser } from '../core';
import { Traklet, type TrakletInstance } from '../Traklet';

/** Internal mutable config for builder */
interface BuilderConfig {
  adapter?: 'github' | 'azure-devops' | 'rest' | 'localStorage';
  token?: string;
  getToken?: () => Promise<string>;
  baseUrl?: string;
  projects?: Array<{ id: string; name: string; description?: string }>;
  user?: TrakletUser;
  permissions?: { anonymousMode?: 'view_only' | 'view_create' };
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme?: { preset?: 'light' | 'dark' | 'auto'; customProperties?: Record<string, string> };
  offlineEnabled?: boolean;
}

/** User configuration for the builder (more flexible than core TrakletUser) */
export interface BuilderUserConfig {
  id: string;
  email?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
}

/** Permission configuration for the builder */
export interface BuilderPermissionConfig {
  canCreate?: boolean;
  canEditOwn?: boolean;
  canEditAll?: boolean;
  canDeleteOwn?: boolean;
  canDeleteAll?: boolean;
  canComment?: boolean;
  canManageLabels?: boolean;
}

/** Theme customization options */
export interface BuilderThemeConfig {
  primary?: string;
  success?: string;
  warning?: string;
  danger?: string;
  bg?: string;
  bgSecondary?: string;
  bgHover?: string;
  text?: string;
  textSecondary?: string;
  textMuted?: string;
  border?: string;
  borderMuted?: string;
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  [key: string]: string | undefined;
}

// Validation schemas
const projectSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
});

const userSchema = z.object({
  id: z.string().optional(),
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  displayName: z.string().optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
});

const permissionSchema = z.object({
  canCreate: z.boolean().optional(),
  canEditOwn: z.boolean().optional(),
  canEditAll: z.boolean().optional(),
  canDeleteOwn: z.boolean().optional(),
  canDeleteAll: z.boolean().optional(),
  canComment: z.boolean().optional(),
  canManageLabels: z.boolean().optional(),
});

const themeSchema = z.object({
  primary: z.string().optional(),
  success: z.string().optional(),
  warning: z.string().optional(),
  danger: z.string().optional(),
  bg: z.string().optional(),
  bgSecondary: z.string().optional(),
  bgHover: z.string().optional(),
  text: z.string().optional(),
  textSecondary: z.string().optional(),
  textMuted: z.string().optional(),
  border: z.string().optional(),
  borderMuted: z.string().optional(),
  radiusSm: z.string().optional(),
  radiusMd: z.string().optional(),
  radiusLg: z.string().optional(),
}).passthrough();

const offlineSchema = z.object({
  enabled: z.boolean().optional(),
  maxQueueSize: z.number().int().positive().optional(),
  syncInterval: z.number().int().positive().optional(),
});

export interface GitHubOptions {
  token?: string;
  getToken?: () => Promise<string>;
}

export interface AzureDevOpsOptions {
  organization: string;
  token?: string;
  getToken?: () => Promise<string>;
}

export interface RestOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  token?: string;
  getToken?: () => Promise<string>;
}

export interface OfflineOptions {
  enabled?: boolean;
  maxQueueSize?: number;
  syncInterval?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * TrakletBuilder - Fluent builder for Traklet configuration
 *
 * @example
 * ```typescript
 * const traklet = await TrakletBuilder
 *   .create()
 *   .useLocalStorage()
 *   .addProject('my-project', 'My Project')
 *   .build();
 * ```
 */
export class TrakletBuilder {
  private config: BuilderConfig = {};
  private projects: Array<{ id: string; name: string; description?: string | undefined }> = [];
  private validationErrors: string[] = [];
  private validationWarnings: string[] = [];

  private constructor() {}

  /**
   * Create a new TrakletBuilder instance
   */
  static create(): TrakletBuilder {
    return new TrakletBuilder();
  }

  // ============================================
  // STEP 1: Choose Backend Adapter
  // ============================================

  /**
   * Use localStorage adapter (for development/testing)
   */
  useLocalStorage(): TrakletBuilder {
    this.config.adapter = 'localStorage';
    return this;
  }

  /**
   * Use GitHub Issues adapter
   * @param options - GitHub configuration options
   */
  useGitHub(options: GitHubOptions = {}): TrakletBuilder {
    this.config.adapter = 'github';
    if (options.token) {
      this.config.token = options.token;
    }
    if (options.getToken) {
      this.config.getToken = options.getToken;
    }
    return this;
  }

  /**
   * Use Azure DevOps Work Items adapter
   * @param options - Azure DevOps configuration options
   */
  useAzureDevOps(options: AzureDevOpsOptions): TrakletBuilder {
    this.config.adapter = 'azure-devops';
    this.config.baseUrl = `https://dev.azure.com/${options.organization}`;
    if (options.token) {
      this.config.token = options.token;
    }
    if (options.getToken) {
      this.config.getToken = options.getToken;
    }
    return this;
  }

  /**
   * Use custom REST API adapter
   * @param options - REST API configuration options
   */
  useRest(options: RestOptions): TrakletBuilder {
    this.config.adapter = 'rest';
    this.config.baseUrl = options.baseUrl;
    if (options.token) {
      this.config.token = options.token;
    }
    if (options.getToken) {
      this.config.getToken = options.getToken;
    }
    return this;
  }

  // ============================================
  // STEP 2: Add Projects
  // ============================================

  /**
   * Add a project to manage
   * @param id - Unique project identifier (e.g., 'owner/repo' for GitHub)
   * @param name - Display name for the project
   * @param description - Optional project description
   */
  addProject(id: string, name: string, description?: string): TrakletBuilder {
    const project: { id: string; name: string; description?: string | undefined } = { id, name };
    if (description !== undefined) {
      project.description = description;
    }
    this.projects.push(project);
    return this;
  }

  /**
   * Add multiple projects at once
   * @param projects - Array of project configurations
   */
  addProjects(projects: Array<{ id: string; name: string; description?: string | undefined }>): TrakletBuilder {
    this.projects.push(...projects);
    return this;
  }

  // ============================================
  // STEP 3: Configure User & Permissions
  // ============================================

  /**
   * Set the current user for permission checking
   * @param user - User configuration
   */
  withUser(user: BuilderUserConfig): TrakletBuilder {
    // Convert to TrakletUser format
    this.config.user = {
      email: user.email ?? '',
      name: user.name,
      displayName: user.displayName,
      id: user.id,
      avatarUrl: user.avatarUrl,
    } as TrakletUser;
    return this;
  }

  /**
   * Configure permissions
   * @param permissions - Permission overrides
   */
  withPermissions(permissions: BuilderPermissionConfig): TrakletBuilder {
    // Map to core permission format (anonymousMode)
    if (permissions.canCreate) {
      this.config.permissions = { anonymousMode: 'view_create' };
    } else {
      this.config.permissions = { anonymousMode: 'view_only' };
    }
    return this;
  }

  /**
   * Enable anonymous mode (no user set)
   * @param canCreate - Whether anonymous users can create issues
   */
  anonymousMode(canCreate = false): TrakletBuilder {
    this.config.permissions = {
      anonymousMode: canCreate ? 'view_create' : 'view_only',
    };
    return this;
  }

  // ============================================
  // STEP 4: UI Customization
  // ============================================

  /**
   * Set widget position
   * @param position - Widget position on screen
   */
  atPosition(position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'): TrakletBuilder {
    this.config.position = position;
    return this;
  }

  /**
   * Apply theme customization
   * @param theme - Theme overrides
   */
  withTheme(theme: BuilderThemeConfig): TrakletBuilder {
    // Convert to ThemeConfig format
    const customProperties: Record<string, string> = {};
    for (const [key, value] of Object.entries(theme)) {
      if (value) {
        // Convert camelCase to CSS custom property format
        const cssKey = `--traklet-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        customProperties[cssKey] = value;
      }
    }
    this.config.theme = { customProperties };
    return this;
  }

  /**
   * Use dark theme preset
   */
  darkTheme(): TrakletBuilder {
    this.config.theme = { preset: 'dark' };
    return this;
  }

  // ============================================
  // STEP 5: Offline Configuration
  // ============================================

  /**
   * Configure offline support
   * @param options - Offline configuration options
   */
  withOfflineSupport(options: OfflineOptions = {}): TrakletBuilder {
    this.config.offlineEnabled = options.enabled ?? true;
    return this;
  }

  /**
   * Disable offline support
   */
  disableOffline(): TrakletBuilder {
    this.config.offlineEnabled = false;
    return this;
  }

  // ============================================
  // Validation & Building
  // ============================================

  /**
   * Validate the current configuration
   * @returns Validation result with errors and warnings
   */
  validate(): ValidationResult {
    this.validationErrors = [];
    this.validationWarnings = [];

    // Validate adapter is set
    if (!this.config.adapter) {
      this.validationErrors.push(
        'No adapter selected. Use useLocalStorage(), useGitHub(), useAzureDevOps(), or useRest().'
      );
    }

    // Validate projects
    if (this.projects.length === 0) {
      this.validationErrors.push(
        'No projects configured. Use addProject() to add at least one project.'
      );
    } else {
      for (const project of this.projects) {
        const result = projectSchema.safeParse(project);
        if (!result.success) {
          for (const issue of result.error.issues) {
            this.validationErrors.push(`Project "${project.id || 'unnamed'}": ${issue.message}`);
          }
        }
      }
    }

    // Validate authentication for remote backends
    if (
      this.config.adapter &&
      this.config.adapter !== 'localStorage' &&
      !this.config.token &&
      !this.config.getToken
    ) {
      this.validationWarnings.push(
        `${this.config.adapter} adapter requires authentication. Set token or getToken.`
      );
    }

    // Validate user if set
    if (this.config.user) {
      const result = userSchema.safeParse(this.config.user);
      if (!result.success) {
        for (const issue of result.error.issues) {
          this.validationErrors.push(`User config: ${issue.message}`);
        }
      }
    }

    // Validate permissions if set
    if (this.config.permissions) {
      const result = permissionSchema.safeParse(this.config.permissions);
      if (!result.success) {
        for (const issue of result.error.issues) {
          this.validationErrors.push(`Permission config: ${issue.message}`);
        }
      }
    }

    // Validate theme if set
    if (this.config.theme) {
      const result = themeSchema.safeParse(this.config.theme);
      if (!result.success) {
        for (const issue of result.error.issues) {
          this.validationErrors.push(`Theme config: ${issue.message}`);
        }
      }
    }

    // No need to validate offlineEnabled - it's just a boolean

    return {
      valid: this.validationErrors.length === 0,
      errors: [...this.validationErrors],
      warnings: [...this.validationWarnings],
    };
  }

  /**
   * Get the built configuration without initializing
   * @throws Error if validation fails
   */
  getConfig(): TrakletConfig {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Invalid configuration:\n${validation.errors.join('\n')}`);
    }

    return {
      ...this.config,
      adapter: this.config.adapter!,
      projects: this.projects,
    } as TrakletConfig;
  }

  /**
   * Build and initialize Traklet
   * @throws Error if validation fails or initialization fails
   */
  async build(): Promise<TrakletInstance> {
    const config = this.getConfig();
    return Traklet.init(config);
  }

  /**
   * Build with a dry-run option to test configuration
   * @param dryRun - If true, only validates without initializing
   */
  async buildWithOptions(options: { dryRun?: boolean } = {}): Promise<{
    instance?: TrakletInstance;
    config: TrakletConfig;
    validation: ValidationResult;
  }> {
    const validation = this.validate();

    if (!validation.valid) {
      return {
        config: this.config as TrakletConfig,
        validation,
      };
    }

    const config = this.getConfig();

    if (options.dryRun) {
      return { config, validation };
    }

    const instance = await Traklet.init(config);
    return { instance, config, validation };
  }
}

/**
 * Validate a raw configuration object
 * @param config - Configuration to validate
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const configSchema = z.object({
    adapter: z.enum(['github', 'azure-devops', 'rest', 'localStorage']),
    projects: z.array(projectSchema).min(1, 'At least one project is required'),
    token: z.string().optional(),
    getToken: z.function().optional(),
    baseUrl: z.string().url().optional(),
    user: userSchema.optional(),
    permissions: permissionSchema.optional(),
    position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
    theme: themeSchema.optional(),
    offline: offlineSchema.optional(),
  });

  const result = configSchema.safeParse(config);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  } else {
    // Check for authentication warnings
    const data = result.data;
    if (data.adapter !== 'localStorage' && !data.token && !data.getToken) {
      warnings.push(`${data.adapter} adapter requires authentication. Set token or getToken.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
