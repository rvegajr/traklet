/**
 * Contracts barrel export
 * All ISP-compliant interfaces for the Traklet widget
 */

// Issue operations
export type { IIssueReader } from './IIssueReader';
export type { IIssueWriter } from './IIssueWriter';
export type { IIssueDeleter } from './IIssueDeleter';

// Comment operations
export type {
  ICommentReader,
  ICommentWriter,
  ICommentDeleter,
  ICommentManager,
} from './ICommentManager';

// Attachment operations
export type {
  IAttachmentReader,
  IAttachmentUploader,
  IAttachmentDeleter,
  IAttachmentHandler,
  AttachmentUploadResult,
} from './IAttachmentHandler';

// Label operations
export type { ILabelReader, ILabelWriter, ILabelDeleter, ILabelManager } from './ILabelManager';

// Project operations
export type {
  IProjectReader,
  IProjectWriter,
  IProjectDeleter,
  IProjectManager,
} from './IProjectManager';

// Capability system
export type { AdapterCapabilities, ICapabilityProvider } from './ICapabilityProvider';
export { DEFAULT_CAPABILITIES } from './ICapabilityProvider';

// Backend adapter
export type {
  IBackendAdapter,
  AdapterType,
  AdapterConfig,
  ProjectConfig,
  ConnectionResult,
} from './IBackendAdapter';
export { adapterHasCapability } from './IBackendAdapter';
