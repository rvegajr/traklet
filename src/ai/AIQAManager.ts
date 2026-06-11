/**
 * AI QA Manager
 * 
 * Main orchestrator for AI-powered QA issue reporting.
 * Coordinates between UI, context gathering, AI provider, and Traklet backend.
 */

import type {
  LLMProvider,
  IssueGenerationContext,
  GeneratedIssue,
  ClarificationQuestion,
  ClarificationAnswer,
  ExistingIssue,
} from '../services/LLMProvider';
import { ClaudeProvider, type ClaudeConfig } from '../services/ClaudeProvider';
import { ContextGatherer } from '../utils/ContextGatherer';
import type { IBackendAdapter } from '../../adapters/IBackendAdapter';

export interface AIQAConfig {
  // LLM Provider
  provider: {
    type: 'claude' | 'openai' | 'local';
    apiKey: string;
    model?: string;
    temperature?: number;
  };

  // Features
  features?: {
    clarificationQuestions?: boolean;
    contextGathering?: boolean;
    duplicateDetection?: boolean;
    severityClassification?: boolean;
  };

  // Context gathering options
  autoCapture?: {
    console?: boolean;
    network?: boolean;
    performance?: boolean;
    localStorage?: boolean;
  };

  // Behavior
  maxClarifications?: number;
  timeout?: number;

  // Hooks
  hooks?: {
    beforeGenerate?: (context: IssueGenerationContext) => Promise<IssueGenerationContext | void>;
    afterGenerate?: (issue: GeneratedIssue) => Promise<GeneratedIssue | void>;
    onError?: (error: Error) => void;
  };
}

export interface AIQASession {
  id: string;
  userInput: string;
  clarificationQuestions?: ClarificationQuestion[];
  clarificationAnswers?: ClarificationAnswer[];
  capturedContext?: any;
  generatedIssue?: GeneratedIssue;
  similarIssues?: any[];
  status: 'input' | 'clarifying' | 'generating' | 'preview' | 'submitted' | 'error';
  error?: Error;
  createdAt: Date;
  submittedAt?: Date;
}

export class AIQAManager {
  private config: Required<AIQAConfig>;
  private llmProvider: LLMProvider;
  private contextGatherer: ContextGatherer;
  private adapter: IBackendAdapter;
  private currentSession: AIQASession | null = null;
  private sessionHistory: AIQASession[] = [];

  constructor(config: AIQAConfig, adapter: IBackendAdapter) {
    // Set defaults
    this.config = {
      ...config,
      features: {
        clarificationQuestions: true,
        contextGathering: true,
        duplicateDetection: true,
        severityClassification: true,
        ...config.features,
      },
      autoCapture: {
        console: true,
        network: true,
        performance: true,
        localStorage: true,
        ...config.autoCapture,
      },
      maxClarifications: config.maxClarifications || 3,
      timeout: config.timeout || 30000,
      hooks: config.hooks || {},
    };

    this.adapter = adapter;

    // Initialize LLM provider
    this.llmProvider = this.createLLMProvider();

    // Initialize context gatherer
    this.contextGatherer = new ContextGatherer({
      captureConsole: this.config.autoCapture.console,
      captureNetwork: this.config.autoCapture.network,
      capturePerformance: this.config.autoCapture.performance,
      captureLocalStorage: this.config.autoCapture.localStorage,
    });
  }

  /**
   * Start a new AI QA session
   */
  async startSession(userInput: string): Promise<AIQASession> {
    // Create new session
    this.currentSession = {
      id: this.generateSessionId(),
      userInput,
      status: 'input',
      createdAt: new Date(),
    };

    try {
      // Check if clarification is needed
      if (this.config.features.clarificationQuestions) {
        const questions = await this.llmProvider.generateClarificationQuestions(userInput);
        
        if (questions.length > 0) {
          this.currentSession.clarificationQuestions = questions.slice(0, this.config.maxClarifications);
          this.currentSession.status = 'clarifying';
          return this.currentSession;
        }
      }

      // No clarification needed, generate immediately
      return await this.generateIssue();

    } catch (error) {
      this.currentSession.status = 'error';
      this.currentSession.error = error instanceof Error ? error : new Error(String(error));
      
      if (this.config.hooks.onError) {
        this.config.hooks.onError(this.currentSession.error);
      }

      throw error;
    }
  }

  /**
   * Submit answers to clarification questions
   */
  async submitClarificationAnswers(answers: ClarificationAnswer[]): Promise<AIQASession> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    if (this.currentSession.status !== 'clarifying') {
      throw new Error('Session is not in clarifying state');
    }

    this.currentSession.clarificationAnswers = answers;
    return await this.generateIssue();
  }

  /**
   * Generate issue from current session
   */
  async generateIssue(): Promise<AIQASession> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.status = 'generating';

    try {
      // Gather context
      const capturedContext = this.config.features.contextGathering
        ? await this.contextGatherer.gatherContext()
        : undefined;

      this.currentSession.capturedContext = capturedContext;

      // Get recent issues for duplicate detection
      const recentIssues = this.config.features.duplicateDetection
        ? await this.getRecentIssues()
        : [];

      // Build generation context
      let context: IssueGenerationContext = {
        userDescription: this.currentSession.userInput,
        clarificationAnswers: this.currentSession.clarificationAnswers,
        browserContext: capturedContext,
        projectContext: {
          recentIssues,
        },
      };

      // Call beforeGenerate hook
      if (this.config.hooks.beforeGenerate) {
        const result = await this.config.hooks.beforeGenerate(context);
        if (result) {
          context = result;
        }
      }

      // Generate issue with AI
      const generatedIssue = await this.llmProvider.generateIssue(context);
      this.currentSession.generatedIssue = generatedIssue;

      // Find similar issues
      if (this.config.features.duplicateDetection && recentIssues.length > 0) {
        const similarIssues = await this.llmProvider.findSimilarIssues(
          generatedIssue.description,
          recentIssues
        );
        this.currentSession.similarIssues = similarIssues.filter(s => s.similarity > 0.6);
      }

      // Call afterGenerate hook
      if (this.config.hooks.afterGenerate) {
        const result = await this.config.hooks.afterGenerate(generatedIssue);
        if (result) {
          this.currentSession.generatedIssue = result;
        }
      }

      this.currentSession.status = 'preview';
      return this.currentSession;

    } catch (error) {
      this.currentSession.status = 'error';
      this.currentSession.error = error instanceof Error ? error : new Error(String(error));
      
      if (this.config.hooks.onError) {
        this.config.hooks.onError(this.currentSession.error);
      }

      throw error;
    }
  }

  /**
   * Submit generated issue to backend
   */
  async submitIssue(edits?: Partial<GeneratedIssue>): Promise<any> {
    if (!this.currentSession?.generatedIssue) {
      throw new Error('No generated issue to submit');
    }

    const issue = edits 
      ? { ...this.currentSession.generatedIssue, ...edits }
      : this.currentSession.generatedIssue;

    try {
      // Create issue via adapter
      const createdIssue = await this.adapter.createIssue({
        title: issue.title,
        body: this.formatIssueBody(issue),
        labels: issue.labels,
        priority: issue.priority,
        component: issue.component,
        type: issue.type,
        // Any other adapter-specific fields
      });

      this.currentSession.status = 'submitted';
      this.currentSession.submittedAt = new Date();
      
      // Save to history
      this.sessionHistory.push({ ...this.currentSession });

      // Clear context for next issue
      this.contextGatherer.clearContext();

      return createdIssue;

    } catch (error) {
      this.currentSession.status = 'error';
      this.currentSession.error = error instanceof Error ? error : new Error(String(error));
      
      if (this.config.hooks.onError) {
        this.config.hooks.onError(this.currentSession.error);
      }

      throw error;
    }
  }

  /**
   * Cancel current session
   */
  cancelSession() {
    if (this.currentSession) {
      this.sessionHistory.push({
        ...this.currentSession,
        status: 'error',
        error: new Error('Cancelled by user'),
      });
    }
    this.currentSession = null;
  }

  /**
   * Get current session
   */
  getCurrentSession(): AIQASession | null {
    return this.currentSession;
  }

  /**
   * Get session history
   */
  getSessionHistory(): AIQASession[] {
    return this.sessionHistory;
  }

  /**
   * Check if AI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.llmProvider.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Create LLM provider based on config
   */
  private createLLMProvider(): LLMProvider {
    switch (this.config.provider.type) {
      case 'claude':
        return new ClaudeProvider({
          type: 'claude',
          apiKey: this.config.provider.apiKey,
          model: this.config.provider.model as any || 'claude-3-sonnet-20240229',
          temperature: this.config.provider.temperature || 0.3,
          timeout: this.config.timeout,
        });

      case 'openai':
        // TODO: Implement OpenAI provider
        throw new Error('OpenAI provider not yet implemented');

      case 'local':
        // TODO: Implement local LLM provider
        throw new Error('Local LLM provider not yet implemented');

      default:
        throw new Error(`Unknown provider type: ${this.config.provider.type}`);
    }
  }

  /**
   * Format issue body from generated issue
   */
  private formatIssueBody(issue: GeneratedIssue): string {
    let body = issue.description + '\n\n';

    if (issue.stepsToReproduce && issue.stepsToReproduce.length > 0) {
      body += '## Steps to Reproduce\n\n';
      issue.stepsToReproduce.forEach((step, idx) => {
        body += `${idx + 1}. ${step}\n`;
      });
      body += '\n';
    }

    if (issue.expectedBehavior) {
      body += `## Expected Behavior\n\n${issue.expectedBehavior}\n\n`;
    }

    if (issue.actualBehavior) {
      body += `## Actual Behavior\n\n${issue.actualBehavior}\n\n`;
    }

    if (issue.environment) {
      body += '## Environment\n\n';
      Object.entries(issue.environment).forEach(([key, value]) => {
        if (value) {
          body += `- **${key}**: ${value}\n`;
        }
      });
      body += '\n';
    }

    // Add AI metadata as comment
    body += `\n---\n\n`;
    body += `<details>\n<summary>🤖 AI Generated (Click to expand)</summary>\n\n`;
    body += `- Model: ${issue.aiMetadata.model}\n`;
    body += `- Confidence: ${Math.round(issue.aiMetadata.confidence.overall * 100)}%\n`;
    body += `- Generated: ${issue.aiMetadata.generatedAt.toISOString()}\n`;
    body += `- Clarifications: ${issue.aiMetadata.clarificationsUsed}\n`;
    body += `\n</details>`;

    return body;
  }

  /**
   * Get recent issues for duplicate detection
   */
  private async getRecentIssues(): Promise<ExistingIssue[]> {
    try {
      const issues = await this.adapter.getIssues({
        limit: 50,
        status: ['open', 'in-progress'],
      });

      return issues.items.map(issue => ({
        id: issue.id,
        title: issue.title,
        description: issue.body || '',
        type: issue.type || 'bug',
        status: issue.status || 'open',
        component: issue.component,
        labels: issue.labels,
        createdAt: issue.createdAt,
      }));
    } catch (error) {
      console.warn('[AIQAManager] Failed to fetch recent issues for duplicate detection:', error);
      return [];
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `aiqa-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    this.contextGatherer.destroy();
    this.currentSession = null;
  }
}
