/**
 * ISP Interface: Label Management Operations
 * Segregated interface for label operations
 */

import type { Label } from '@/models';

export interface ILabelReader {
  /**
   * Get all available labels for a project
   */
  getLabels(projectId: string): Promise<readonly Label[]>;
}

export interface ILabelWriter {
  /**
   * Create a new label
   */
  createLabel(
    projectId: string,
    label: { name: string; color: string; description?: string }
  ): Promise<Label>;

  /**
   * Update an existing label
   */
  updateLabel(
    projectId: string,
    labelId: string,
    updates: { name?: string; color?: string; description?: string }
  ): Promise<Label>;
}

export interface ILabelDeleter {
  /**
   * Delete a label
   */
  deleteLabel(projectId: string, labelId: string): Promise<void>;
}

/**
 * Combined label manager for adapters with full label support
 */
export interface ILabelManager extends ILabelReader, ILabelWriter, ILabelDeleter {}
