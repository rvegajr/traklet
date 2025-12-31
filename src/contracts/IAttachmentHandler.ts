/**
 * ISP Interface: Attachment Handling Operations
 * Segregated interface for file attachment operations
 */

import type { Attachment } from '@/models';

export interface AttachmentUploadResult {
  readonly attachment: Attachment;
  readonly success: boolean;
  readonly error?: string | undefined;
}

export interface IAttachmentReader {
  /**
   * Get attachments for an issue
   */
  getAttachments(projectId: string, issueId: string): Promise<readonly Attachment[]>;

  /**
   * Get a download URL for an attachment
   */
  getAttachmentUrl(projectId: string, attachmentId: string): Promise<string>;
}

export interface IAttachmentUploader {
  /**
   * Upload attachments to an issue
   */
  uploadAttachments(
    projectId: string,
    issueId: string,
    files: readonly File[]
  ): Promise<readonly AttachmentUploadResult[]>;

  /**
   * Get maximum allowed file size in bytes
   */
  getMaxFileSize(): number;

  /**
   * Get allowed MIME types
   */
  getAllowedMimeTypes(): readonly string[];
}

export interface IAttachmentDeleter {
  /**
   * Delete an attachment
   */
  deleteAttachment(projectId: string, issueId: string, attachmentId: string): Promise<void>;
}

/**
 * Combined attachment handler for adapters with full attachment support
 */
export interface IAttachmentHandler
  extends IAttachmentReader,
    IAttachmentUploader,
    IAttachmentDeleter {}
