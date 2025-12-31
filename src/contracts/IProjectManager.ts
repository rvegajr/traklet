/**
 * ISP Interface: Project Management Operations
 * Segregated interface for multi-project support
 */

import type { Project } from '@/models';

export interface IProjectReader {
  /**
   * Get all configured projects
   */
  getProjects(): Promise<readonly Project[]>;

  /**
   * Get a single project by ID
   */
  getProject(projectId: string): Promise<Project>;
}

export interface IProjectWriter {
  /**
   * Add a project configuration
   */
  addProject(project: Omit<Project, 'id'>): Promise<Project>;

  /**
   * Update project configuration
   */
  updateProject(projectId: string, updates: Partial<Omit<Project, 'id'>>): Promise<Project>;
}

export interface IProjectDeleter {
  /**
   * Remove a project from configuration
   */
  removeProject(projectId: string): Promise<void>;
}

/**
 * Combined project manager interface
 */
export interface IProjectManager extends IProjectReader, IProjectWriter, IProjectDeleter {}
