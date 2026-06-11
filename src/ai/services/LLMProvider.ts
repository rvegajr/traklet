/**
 * LLM Provider Interface
 * 
 * Abstraction for AI providers (Claude, OpenAI, local LLMs)
 * All providers must implement this interface for Traklet AI QA features
 */

export interface LLMProvider {
  /**
   * Generate a structured issue from QA input
   */
  generateIssue(context: IssueGenerationContext): Promise<GeneratedIssue>;

  /**
   * Generate clarification questions based on initial input
   */
  generateClarificationQuestions(input: string): Promise<ClarificationQuestion[]>;

  /**
   * Find semantically similar existing issues
   */
  findSimilarIssues(description: string, existingIssues: ExistingIssue[]): Promise<SimilarityResult[]>;

  /**
   * Classify issue severity/priority
   */
  classifySeverity(context: IssueGenerationContext): Promise<SeverityClassification>;

  /**
   * Check if provider is available and configured
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Context provided to AI for issue generation
 */
export interface IssueGenerationContext {
  // User's natural language description
  userDescription: string;

  // Answers to clarification questions
  clarificationAnswers?: ClarificationAnswer[];

  // Automatically captured context
  browserContext?: BrowserContext;
  
  // Attached files
  attachments?: AttachmentInfo[];

  // Project-specific context
  projectContext?: {
    recentIssues?: ExistingIssue[];
    componentList?: string[];
    labelsList?: string[];
  };
}

/**
 * Generated issue structure
 */
export interface GeneratedIssue {
  // Issue metadata
  title: string;
  type: IssueType;
  priority: IssuePriority;
  component?: string;
  labels?: string[];

  // Content
  description: string;
  stepsToReproduce?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;

  // Environment
  environment?: EnvironmentInfo;

  // AI metadata
  aiMetadata: {
    confidence: {
      overall: number;
      title: number;
      priority: number;
      component: number;
      type: number;
    };
    model: string;
    generatedAt: Date;
    clarificationsUsed: number;
  };
}

/**
 * Clarification question from AI
 */
export interface ClarificationQuestion {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'boolean';
  options?: string[];
  required: boolean;
  autoDetect?: boolean; // Can we auto-detect this?
  autoDetectSource?: 'browser' | 'console' | 'network' | 'localStorage';
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string | string[] | boolean;
  autoDetected: boolean;
}

/**
 * Browser context captured automatically
 */
export interface BrowserContext {
  browser: {
    userAgent: string;
    name: string;
    version: string;
    viewport: { width: number; height: number };
    platform: string;
  };

  page: {
    url: string;
    title: string;
    timestamp: Date;
    referrer?: string;
  };

  console: {
    errors: ConsoleEntry[];
    warnings: ConsoleEntry[];
    logs: ConsoleEntry[];
  };

  network: {
    failedRequests: NetworkRequest[];
    slowRequests: NetworkRequest[];
    totalRequests: number;
  };

  performance: {
    loadTime: number;
    domContentLoaded: number;
    memoryUsage?: number;
  };

  localStorage: {
    keyCount: number;
    keys: string[]; // Just keys, never values
  };
}

export interface ConsoleEntry {
  level: 'error' | 'warn' | 'log' | 'info';
  message: string;
  timestamp: Date;
  stack?: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  failed: boolean;
  errorMessage?: string;
}

/**
 * Existing issue for similarity comparison
 */
export interface ExistingIssue {
  id: string;
  title: string;
  description: string;
  type: IssueType;
  status: string;
  component?: string;
  labels?: string[];
  createdAt: Date;
}

export interface SimilarityResult {
  issue: ExistingIssue;
  similarity: number; // 0-1
  matchingTerms: string[];
  reason: string;
}

/**
 * Severity classification result
 */
export interface SeverityClassification {
  priority: IssuePriority;
  confidence: number;
  reasoning: string;
  suggestedLabels?: string[];
}

/**
 * Environment information
 */
export interface EnvironmentInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  appVersion?: string;
  [key: string]: string | undefined;
}

export interface AttachmentInfo {
  name: string;
  type: string;
  size: number;
  url?: string;
}

/**
 * Issue types
 */
export type IssueType = 'bug' | 'feature' | 'enhancement' | 'task' | 'question';

/**
 * Issue priorities
 */
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Provider configuration
 */
export interface LLMProviderConfig {
  type: 'claude' | 'openai' | 'local' | 'custom';
  apiKey?: string;
  apiUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * Error types
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
