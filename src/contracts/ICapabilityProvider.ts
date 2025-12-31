/**
 * ISP Interface: Capability Declaration
 * Allows adapters to declare which features they support
 */

export interface AdapterCapabilities {
  /** Can delete issues (GitHub cannot) */
  readonly canDeleteIssues: boolean;

  /** Supports file attachments */
  readonly hasAttachments: boolean;

  /** Supports issue priority field */
  readonly hasPriority: boolean;

  /** Supports labels/tags */
  readonly hasLabels: boolean;

  /** Supports assignees */
  readonly hasAssignees: boolean;

  /** Supports comments */
  readonly hasComments: boolean;

  /** Supports full-text search */
  readonly hasSearch: boolean;

  /** Maximum file size for attachments (0 = no attachments) */
  readonly maxAttachmentSize: number;

  /** Allowed MIME types for attachments */
  readonly allowedMimeTypes: readonly string[];
}

export interface ICapabilityProvider {
  /**
   * Get the capabilities of this adapter
   */
  getCapabilities(): AdapterCapabilities;

  /**
   * Check if a specific capability is supported
   */
  hasCapability(capability: keyof AdapterCapabilities): boolean;
}

/**
 * Default capabilities for adapters that don't override
 */
export const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  canDeleteIssues: false,
  hasAttachments: false,
  hasPriority: false,
  hasLabels: true,
  hasAssignees: true,
  hasComments: true,
  hasSearch: true,
  maxAttachmentSize: 0,
  allowedMimeTypes: [],
} as const;
