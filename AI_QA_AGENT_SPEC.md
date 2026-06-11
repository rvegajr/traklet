# AI QA Agent - Specification

## Overview

Transform Traklet into an AI-powered QA assistant that allows QA testers to create development requests using natural language, with AI handling the conversion to structured, actionable tickets.

## Vision

**Current State:** QA manually fills out forms with title, description, steps to reproduce, etc.

**Future State:** QA describes the issue naturally: "Login button doesn't work on mobile Safari" → AI generates a complete, structured ticket with all necessary details.

---

## User Flow

### QA Tester Journey

```
1. QA discovers an issue while testing
   ↓
2. Opens Traklet widget (bottom-right corner)
   ↓
3. Clicks "Report Issue with AI" button
   ↓
4. Natural language input panel opens
   "The login button doesn't respond when I tap it on my iPhone"
   ↓
5. AI analyzes and asks clarifying questions:
   - "What happens when you tap it? No visual feedback or error?"
   - "Does this happen every time or intermittently?"
   - "Are you logged in or on the login page?"
   ↓
6. QA answers (can attach screenshot/video)
   ↓
7. AI generates structured ticket preview:
   ┌─────────────────────────────────────────┐
   │ Title: Login button unresponsive on     │
   │        iOS Safari (touch event issue)   │
   │                                         │
   │ Priority: High                          │
   │ Type: Bug                               │
   │ Component: Authentication/UI            │
   │                                         │
   │ Description:                            │
   │ The login button on the authentication  │
   │ page does not respond to touch events   │
   │ on iOS Safari mobile browser...         │
   │                                         │
   │ Steps to Reproduce:                     │
   │ 1. Open app on iPhone (iOS 17+)        │
   │ 2. Navigate to login page              │
   │ 3. Tap the "Sign In" button            │
   │ 4. Observe no response                 │
   │                                         │
   │ Expected: Button should show active    │
   │ state and trigger login                │
   │                                         │
   │ Actual: No visual feedback, no action  │
   │                                         │
   │ Environment:                            │
   │ - Browser: Safari iOS 17.2             │
   │ - Device: iPhone 14 Pro                │
   │ - App Version: 2.1.3                   │
   │                                         │
   │ Attachments: [screenshot.png]          │
   └─────────────────────────────────────────┘
   ↓
8. QA reviews, edits if needed, clicks "Create Issue"
   ↓
9. Issue created in Azure DevOps/GitHub
   ↓
10. Developer receives well-structured ticket
```

---

## Core Features

### 1. Natural Language Input

**Component:** `AIInputPanel`

```typescript
interface AIInputPanel {
  // User types naturally, no structure required
  placeholder: "Describe what you found... (e.g., 'Login button not working')";
  
  // AI provides real-time suggestions
  suggestions: [
    "It sounds like a bug. Would you like me to capture browser context?",
    "This might be a feature request. Should I categorize it as enhancement?"
  ];
  
  // Quick actions
  actions: {
    attachScreenshot: true;
    recordVideo: true;
    captureConsoleErrors: true;
    captureNetworkRequests: true;
  };
}
```

### 2. AI Clarification Dialog

**Component:** `AIClarificationAgent`

The AI asks intelligent follow-up questions:

```typescript
class AIClarificationAgent {
  async analyze(input: string): Promise<Question[]> {
    // AI determines what's missing
    const questions = [
      {
        question: "What browser and version are you using?",
        type: "select",
        options: ["Chrome", "Firefox", "Safari", "Edge"],
        autoDetect: true // Try to detect from user agent
      },
      {
        question: "Does this happen every time or only sometimes?",
        type: "select",
        options: ["Every time", "Intermittent", "First occurrence"]
      },
      {
        question: "What error message do you see, if any?",
        type: "text",
        autoCapture: "console" // Can auto-capture from browser console
      }
    ];
    return questions;
  }
}
```

### 3. Context Gathering

**Component:** `ContextGatherer`

Automatically capture technical context:

```typescript
interface CapturedContext {
  browser: {
    userAgent: string;
    version: string;
    viewport: { width: number; height: number };
  };
  
  page: {
    url: string;
    title: string;
    timestamp: Date;
  };
  
  console: {
    errors: ConsoleError[];
    warnings: ConsoleWarning[];
    lastLogs: string[];
  };
  
  network: {
    failedRequests: NetworkRequest[];
    slowRequests: NetworkRequest[];
  };
  
  localStorage: {
    keys: string[];
    // Don't capture values (privacy)
  };
  
  performance: {
    loadTime: number;
    memoryUsage: number;
  };
}
```

### 4. AI Ticket Generator

**Component:** `IssueGenerator`

Converts natural language + context → structured ticket:

```typescript
class IssueGenerator {
  async generate(params: {
    userDescription: string;
    clarificationAnswers: Answer[];
    capturedContext: CapturedContext;
    attachments: File[];
  }): Promise<GeneratedIssue> {
    
    const prompt = `
You are a technical issue creator. Convert this QA report into a structured development ticket.

QA Description: "${params.userDescription}"
Answers: ${JSON.stringify(params.clarificationAnswers)}
Context: ${JSON.stringify(params.capturedContext)}

Generate:
1. Concise title (max 80 chars) - be specific
2. Type (Bug / Feature / Task / Enhancement)
3. Priority (Critical / High / Medium / Low) based on severity
4. Affected component(s)
5. Clear description with context
6. Numbered steps to reproduce (if bug)
7. Expected vs Actual behavior (if bug)
8. Environment details
9. Suggested labels/tags
10. Potential related issues (search existing)

Format as structured JSON.
`;

    const aiResponse = await callLLM(prompt);
    return parseAndValidate(aiResponse);
  }
}
```

### 5. Duplicate Detection

**Component:** `DuplicateDetector`

Check if similar issue already exists:

```typescript
class DuplicateDetector {
  async findSimilar(generatedIssue: GeneratedIssue): Promise<ExistingIssue[]> {
    // Semantic search across existing issues
    const semanticQuery = await embedDescription(generatedIssue.description);
    
    const similarIssues = await searchIssues({
      semantic: semanticQuery,
      filters: {
        component: generatedIssue.component,
        type: generatedIssue.type,
        status: ["open", "in-progress"]
      },
      limit: 5
    });
    
    return similarIssues.map(issue => ({
      ...issue,
      similarity: calculateSimilarity(generatedIssue, issue)
    }));
  }
}
```

### 6. Preview & Edit

**Component:** `IssuePreview`

Show AI-generated ticket before submission:

```typescript
interface IssuePreview {
  // Display generated ticket
  generatedIssue: GeneratedIssue;
  
  // Allow QA to edit any field
  editable: true;
  
  // Show confidence scores
  aiConfidence: {
    priority: 0.92,    // High confidence
    component: 0.78,   // Medium confidence
    type: 0.95         // Very high confidence
  };
  
  // Show similar issues
  duplicateWarning?: {
    message: "Found 2 similar open issues. Are these related?";
    issues: ExistingIssue[];
  };
  
  // Actions
  actions: {
    createIssue: () => void;
    editAndCreate: () => void;
    cancel: () => void;
  };
}
```

---

## Technical Architecture

### File Structure

```
src/
├── ai/
│   ├── agents/
│   │   ├── ClarificationAgent.ts      // Asks follow-up questions
│   │   ├── IssueGenerator.ts          // Generates structured tickets
│   │   ├── DuplicateDetector.ts       // Finds similar issues
│   │   └── SeverityClassifier.ts      // Determines priority
│   │
│   ├── services/
│   │   ├── LLMProvider.ts             // Abstraction for Claude/OpenAI
│   │   ├── PromptTemplates.ts         // Reusable prompts
│   │   └── EmbeddingService.ts        // For semantic search
│   │
│   └── utils/
│       ├── ContextGatherer.ts         // Captures browser/app context
│       └── ResponseParser.ts          // Parses AI responses
│
├── ui/
│   ├── components/
│   │   ├── AIInputPanel.ts            // Natural language input
│   │   ├── ClarificationDialog.ts     // AI questions UI
│   │   ├── ContextViewer.ts           // Shows captured context
│   │   ├── IssuePreview.ts            // Preview before submit
│   │   └── SimilarIssuesCard.ts       // Shows duplicates
│   │
│   └── styles/
│       └── ai-components.css
│
├── core/
│   ├── AIQAManager.ts                 // Main orchestrator
│   └── ConfigManager.ts               // AI provider config
│
└── types/
    ├── ai.types.ts
    └── issue.types.ts
```

### Integration with Traklet

```typescript
// Extend existing Traklet.init()
Traklet.init({
  adapter: 'azure-devops',
  token: process.env.PAT,
  
  // NEW: AI QA Agent config
  aiQA: {
    enabled: true,
    
    // LLM Provider
    provider: 'claude', // or 'openai', 'local'
    apiKey: process.env.CLAUDE_API_KEY,
    model: 'claude-3-sonnet-20240229',
    
    // Features
    features: {
      clarificationQuestions: true,
      contextGathering: true,
      duplicateDetection: true,
      severityClassification: true,
    },
    
    // Behavior
    autoCapture: {
      console: true,
      network: true,
      performance: true,
      screenshots: true, // Ask permission first
    },
    
    // Hooks
    hooks: {
      beforeGenerate: (context) => { /* custom logic */ },
      afterGenerate: (issue) => { /* validate/modify */ },
      onError: (error) => { /* handle */ }
    }
  }
});
```

---

## AI Provider Support

### Claude (Recommended)

```typescript
// Best for: Structured output, reasoning
class ClaudeProvider implements LLMProvider {
  async generateIssue(context: IssueContext): Promise<GeneratedIssue> {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: buildPrompt(context)
      }]
    });
    
    return parseResponse(response);
  }
}
```

### OpenAI

```typescript
// Alternative provider
class OpenAIProvider implements LLMProvider {
  async generateIssue(context: IssueContext): Promise<GeneratedIssue> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{
        role: 'system',
        content: 'You are a QA issue generator...'
      }, {
        role: 'user',
        content: buildPrompt(context)
      }],
      response_format: { type: 'json_object' }
    });
    
    return JSON.parse(response.choices[0].message.content);
  }
}
```

### Local LLM (Privacy-focused)

```typescript
// For companies that can't use external APIs
class LocalLLMProvider implements LLMProvider {
  // Use Ollama or similar
  async generateIssue(context: IssueContext): Promise<GeneratedIssue> {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'llama2',
        prompt: buildPrompt(context)
      })
    });
    
    return parseResponse(await response.json());
  }
}
```

---

## User Interface

### Widget Enhancement

```
┌─────────────────────────────────────────────┐
│ Traklet                              [—][×] │
├─────────────────────────────────────────────┤
│                                             │
│  [All Issues] [My Issues] [AI Report] ← NEW│
│                                             │
├─────────────────────────────────────────────┤
│  When "AI Report" clicked:                  │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ 💬 Describe what you found...         │ │
│  │                                       │ │
│  │ Type naturally, no need for structure│ │
│  │                                       │ │
│  │ [📸 Screenshot] [🎥 Video] [🔧 Context]│ │
│  └───────────────────────────────────────┘ │
│                                             │
│  AI Suggestion:                             │
│  "This sounds like a bug. I'll capture     │
│   browser context and ask a few questions." │
│                                             │
│  [ Ask Me Questions ]  [ Generate Now ]    │
│                                             │
└─────────────────────────────────────────────┘
```

### Clarification Dialog

```
┌─────────────────────────────────────────────┐
│ Help me understand this better... 🤖        │
├─────────────────────────────────────────────┤
│                                             │
│  Question 1 of 3:                           │
│                                             │
│  What browser are you using?                │
│  ○ Chrome     ○ Firefox                     │
│  ○ Safari     ○ Edge                        │
│  ● Auto-detected: Safari iOS 17.2           │
│                                             │
│  [Previous]  [Next Question]                │
│                                             │
└─────────────────────────────────────────────┘
```

### Issue Preview

```
┌─────────────────────────────────────────────┐
│ Review AI-Generated Ticket 📋               │
├─────────────────────────────────────────────┤
│                                             │
│  Title: Login button unresponsive on iOS   │
│         [Edit] ← Inline editing             │
│                                             │
│  Type: 🐛 Bug     Priority: 🔴 High         │
│  Component: Authentication                  │
│                                             │
│  ⚠️ Found 2 similar open issues:            │
│  #247 - iOS touch events broken             │
│  #198 - Mobile login issues                 │
│  [View Similar Issues]                      │
│                                             │
│  AI Confidence:                             │
│  Priority: ████████░░ 92%                   │
│  Component: ███████░░░ 78%                  │
│  Type: █████████░ 95%                       │
│                                             │
│  [✓ Create Issue]  [✏️ Edit More]  [× Cancel]│
│                                             │
└─────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)
- [ ] Basic natural language input
- [ ] Simple AI prompt to Claude/OpenAI
- [ ] Generate title + description only
- [ ] Manual review before submit
- [ ] Config: enable/disable AI feature

### Phase 2: Enhanced Generation (Week 3-4)
- [ ] AI clarification questions
- [ ] Context gathering (browser, console, network)
- [ ] Structured output (steps to reproduce, expected/actual)
- [ ] Priority/severity classification
- [ ] Component detection

### Phase 3: Smart Features (Week 5-6)
- [ ] Duplicate detection (semantic search)
- [ ] Similar issues suggestion
- [ ] Confidence scores
- [ ] Edit before submit
- [ ] Learning from feedback

### Phase 4: Advanced (Week 7-8)
- [ ] Screenshot annotation (AI analyzes images)
- [ ] Video recording + AI transcription
- [ ] Root cause suggestions
- [ ] Related issues linking
- [ ] Analytics dashboard

---

## Configuration

### Environment Variables

```bash
# AI Provider
TRAKLET_AI_PROVIDER=claude  # claude | openai | local
TRAKLET_AI_API_KEY=sk-...
TRAKLET_AI_MODEL=claude-3-sonnet-20240229

# Features
TRAKLET_AI_ENABLED=true
TRAKLET_AI_AUTO_CONTEXT=true
TRAKLET_AI_DUPLICATE_CHECK=true

# Behavior
TRAKLET_AI_MAX_CLARIFICATIONS=3
TRAKLET_AI_TIMEOUT_MS=30000
```

### Runtime Config

```typescript
Traklet.init({
  aiQA: {
    enabled: true,
    provider: {
      type: 'claude',
      apiKey: process.env.CLAUDE_API_KEY,
      model: 'claude-3-sonnet-20240229',
      temperature: 0.3, // Lower = more consistent
    },
    features: {
      clarificationQuestions: true,
      contextGathering: true,
      duplicateDetection: true,
    },
    limits: {
      maxClarifications: 3,
      timeout: 30000,
    }
  }
});
```

---

## Security & Privacy

### Data Handling

1. **Sensitive Data:**
   - Never send tokens, passwords, or API keys to AI
   - Sanitize localStorage keys (don't send values)
   - Redact credit card numbers, emails, phone numbers
   - Hash user IDs before sending to AI

2. **User Consent:**
   - Explicit opt-in for AI features
   - Clear disclosure: "AI will process your description"
   - Option to disable context gathering
   - Allow screenshot/video opt-out

3. **Data Retention:**
   - AI prompts stored for 30 days (optional)
   - Can be disabled completely
   - Used for model improvement (with consent)

### Prompt Safety

```typescript
function sanitizeInput(input: string): string {
  // Remove sensitive patterns
  input = redactEmails(input);
  input = redactPhoneNumbers(input);
  input = redactAPIKeys(input);
  input = redactTokens(input);
  
  // Limit length
  if (input.length > 5000) {
    input = input.substring(0, 5000) + '...';
  }
  
  return input;
}
```

---

## Success Metrics

### QA Efficiency
- **Time to create ticket:** 5 minutes → 1 minute (80% reduction)
- **Ticket quality score:** Manual baseline → AI-enhanced
- **Developer clarification requests:** Baseline → Reduced by 60%

### Developer Efficiency
- **Time to understand issue:** Baseline → Reduced by 50%
- **First-response time:** Baseline → Reduced by 30%
- **Duplicate ticket rate:** Baseline → Reduced by 40%

### System Metrics
- **AI generation success rate:** Target >95%
- **Average confidence scores:** Target >85%
- **Duplicate detection accuracy:** Target >80%
- **User satisfaction:** Target >4.5/5

---

## Next Steps

1. **Create AI Provider Abstraction** - LLM interface
2. **Build Input Panel** - Natural language UI
3. **Implement Issue Generator** - Core AI logic
4. **Add Context Gathering** - Browser/app data
5. **Build Preview UI** - Review before submit
6. **Test & Iterate** - Real QA feedback

---

**Let's build this! 🚀**
