/**
 * Claude AI Provider for Traklet
 * 
 * Uses Anthropic's Claude API to power AI QA features
 * Recommended provider for best results with structured outputs
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  IssueGenerationContext,
  GeneratedIssue,
  ClarificationQuestion,
  ExistingIssue,
  SimilarityResult,
  SeverityClassification,
  LLMProviderError,
} from './LLMProvider';

export interface ClaudeConfig extends LLMProviderConfig {
  type: 'claude';
  model: 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307';
  apiKey: string;
  apiUrl?: string; // Default: https://api.anthropic.com
  maxTokens?: number; // Default: 2000
  temperature?: number; // Default: 0.3 (lower = more consistent)
}

export class ClaudeProvider implements LLMProvider {
  private config: ClaudeConfig;
  private baseUrl: string;

  constructor(config: ClaudeConfig) {
    this.config = {
      apiUrl: 'https://api.anthropic.com',
      maxTokens: 2000,
      temperature: 0.3,
      timeout: 30000,
      ...config,
    };
    this.baseUrl = this.config.apiUrl!;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      // Quick health check
      const response = await this.callClaude({
        messages: [{
          role: 'user',
          content: 'ping'
        }],
        max_tokens: 10
      });
      return !!response;
    } catch (error) {
      console.warn('[ClaudeProvider] Health check failed:', error);
      return false;
    }
  }

  async generateIssue(context: IssueGenerationContext): Promise<GeneratedIssue> {
    const prompt = this.buildIssueGenerationPrompt(context);

    try {
      const response = await this.callClaude({
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: this.config.maxTokens!,
        temperature: this.config.temperature!,
      });

      const parsed = this.parseIssueResponse(response.content[0].text);
      
      return {
        ...parsed,
        aiMetadata: {
          confidence: this.calculateConfidence(parsed, context),
          model: this.config.model,
          generatedAt: new Date(),
          clarificationsUsed: context.clarificationAnswers?.length || 0,
        }
      };
    } catch (error) {
      throw this.handleError(error, 'generateIssue');
    }
  }

  async generateClarificationQuestions(input: string): Promise<ClarificationQuestion[]> {
    const prompt = `
You are helping a QA tester create a bug report. They described an issue like this:

"${input}"

Generate 2-4 clarifying questions that will help create a complete bug report. For each question:
1. Ask what's missing or unclear
2. Provide options when applicable
3. Indicate if we can auto-detect the answer from browser context

Return as JSON array:
[
  {
    "id": "q1",
    "question": "What browser are you using?",
    "type": "select",
    "options": ["Chrome", "Firefox", "Safari", "Edge"],
    "required": true,
    "autoDetect": true,
    "autoDetectSource": "browser"
  }
]

Focus on:
- Browser/device info (if not obvious)
- Reproduction frequency (always, sometimes, once)
- Error messages or visual feedback
- Steps to reproduce (if not described)

Keep it concise. Maximum 4 questions.`;

    try {
      const response = await this.callClaude({
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 1000,
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw this.handleError(error, 'generateClarificationQuestions');
    }
  }

  async findSimilarIssues(
    description: string,
    existingIssues: ExistingIssue[]
  ): Promise<SimilarityResult[]> {
    if (existingIssues.length === 0) {
      return [];
    }

    const prompt = `
Compare this new issue description with existing issues and find similarities.

New Issue: "${description}"

Existing Issues:
${existingIssues.map((issue, idx) => `
${idx + 1}. [${issue.id}] ${issue.title}
   ${issue.description.substring(0, 200)}...
   Status: ${issue.status}, Component: ${issue.component || 'N/A'}
`).join('\n')}

For each existing issue, determine:
1. Similarity score (0-100, where 100 = duplicate, 70+ = very similar)
2. Matching terms/concepts
3. Brief reason why they're similar

Return as JSON array (only include issues with similarity > 60):
[
  {
    "issueId": "123",
    "similarity": 85,
    "matchingTerms": ["login", "button", "iOS"],
    "reason": "Both describe login button issues on mobile iOS"
  }
]

If no similar issues, return empty array [].`;

    try {
      const response = await this.callClaude({
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 1500,
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        return [];
      }

      const results = JSON.parse(jsonMatch[0]);

      return results.map((result: any) => ({
        issue: existingIssues.find(i => i.id === result.issueId)!,
        similarity: result.similarity / 100, // Convert to 0-1
        matchingTerms: result.matchingTerms,
        reason: result.reason
      }));
    } catch (error) {
      console.warn('[ClaudeProvider] Similarity search failed:', error);
      return []; // Non-critical, return empty
    }
  }

  async classifySeverity(context: IssueGenerationContext): Promise<SeverityClassification> {
    const prompt = `
Classify the severity of this issue:

Description: "${context.userDescription}"
${context.browserContext?.console.errors.length ? `
Console Errors: ${context.browserContext.console.errors.length}
` : ''}

Determine:
1. Priority: critical | high | medium | low
2. Reasoning: Why this priority?
3. Suggested labels

Priority Guidelines:
- Critical: System down, data loss, security issue, affects all users
- High: Major functionality broken, affects many users
- Medium: Feature partially broken, workaround exists
- Low: Minor issue, cosmetic, edge case

Return as JSON:
{
  "priority": "high",
  "confidence": 0.85,
  "reasoning": "Login functionality is broken on a major platform (iOS), affecting user access",
  "suggestedLabels": ["mobile", "authentication", "ios-bug"]
}`;

    try {
      const response = await this.callClaude({
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 500,
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw this.handleError(error, 'classifySeverity');
    }
  }

  /**
   * Build comprehensive prompt for issue generation
   */
  private buildIssueGenerationPrompt(context: IssueGenerationContext): string {
    return `
You are a technical issue creator helping a QA tester document a bug or feature request.

QA's Description:
"${context.userDescription}"

${context.clarificationAnswers?.length ? `
QA's Answers to Follow-up Questions:
${context.clarificationAnswers.map(a => `- ${a.questionId}: ${a.answer}`).join('\n')}
` : ''}

${context.browserContext ? `
Captured Browser Context:
- Browser: ${context.browserContext.browser.name} ${context.browserContext.browser.version}
- Platform: ${context.browserContext.browser.platform}
- Page: ${context.browserContext.page.url}
- Console Errors: ${context.browserContext.console.errors.length}
- Failed Network Requests: ${context.browserContext.network.failedRequests.length}
${context.browserContext.console.errors.length > 0 ? `
Recent Console Errors:
${context.browserContext.console.errors.slice(0, 3).map(e => `  - ${e.message}`).join('\n')}
` : ''}
` : ''}

${context.projectContext?.componentList?.length ? `
Available Components: ${context.projectContext.componentList.join(', ')}
` : ''}

${context.projectContext?.labelsList?.length ? `
Available Labels: ${context.projectContext.labelsList.join(', ')}
` : ''}

Generate a complete, structured issue ticket in JSON format:

{
  "title": "Concise, specific title (max 80 chars)",
  "type": "bug | feature | enhancement | task",
  "priority": "critical | high | medium | low",
  "component": "affected component (if identifiable)",
  "labels": ["relevant", "labels"],
  "description": "Clear description with context. Explain what's happening and why it matters.",
  "stepsToReproduce": [
    "1. Step one",
    "2. Step two",
    "3. Observe issue"
  ],
  "expectedBehavior": "What should happen",
  "actualBehavior": "What actually happens",
  "environment": {
    "browser": "Browser name and version",
    "os": "Operating system",
    "device": "Device type (if applicable)",
    "appVersion": "App version (if known)"
  }
}

Guidelines:
- Title: Be specific. Include key terms (e.g., "Login button unresponsive on iOS Safari")
- Type: Bug = something broken, Feature = new capability, Enhancement = improve existing
- Priority: Based on impact and scope (see context for severity)
- Steps: Numbered, clear, reproducible
- Description: Professional, technical, complete context
- Use information from browser context when relevant

Return ONLY the JSON object, no additional text.`;
  }

  /**
   * Parse AI response into GeneratedIssue
   */
  private parseIssueResponse(responseText: string): Omit<GeneratedIssue, 'aiMetadata'> {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.title || !parsed.type) {
      throw new Error('Invalid issue structure: missing required fields');
    }

    return parsed;
  }

  /**
   * Calculate confidence scores
   */
  private calculateConfidence(
    issue: Omit<GeneratedIssue, 'aiMetadata'>,
    context: IssueGenerationContext
  ) {
    // Base confidence on available context
    const hasSteps = issue.stepsToReproduce && issue.stepsToReproduce.length > 0;
    const hasBrowserContext = !!context.browserContext;
    const hasClarifications = context.clarificationAnswers && context.clarificationAnswers.length > 0;
    const hasEnvironment = !!issue.environment;

    const overall = (
      (hasSteps ? 25 : 0) +
      (hasBrowserContext ? 25 : 0) +
      (hasClarifications ? 25 : 0) +
      (hasEnvironment ? 25 : 0)
    ) / 100;

    return {
      overall,
      title: issue.title.length > 20 ? 0.9 : 0.7,
      priority: issue.priority ? 0.85 : 0.5,
      component: issue.component ? 0.8 : 0.4,
      type: issue.type ? 0.95 : 0.6,
    };
  }

  /**
   * Call Claude API
   */
  private async callClaude(params: {
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    temperature?: number;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: params.max_tokens,
        temperature: params.temperature ?? this.config.temperature,
        messages: params.messages,
      }),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Handle and wrap errors
   */
  private handleError(error: any, operation: string): LLMProviderError {
    const message = error.message || 'Unknown error';
    const retryable = error.name === 'AbortError' || message.includes('timeout') || message.includes('rate limit');

    return new LLMProviderError(
      `Claude ${operation} failed: ${message}`,
      'claude',
      error.code || 'UNKNOWN',
      retryable
    );
  }
}
