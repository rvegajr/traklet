/**
 * TestCaseTemplate - Structured work item body format
 *
 * Uses HTML comments as machine-parseable markers that are invisible
 * when rendered in Azure DevOps or GitHub. Traklet parses these to
 * present guided, section-based UI for testers.
 *
 * Format:
 *   {traklet:section:NAME}
 *   ## Section Title
 *   Content here
 *   {/traklet:section:NAME}
 */

// ============================================
// Types
// ============================================

export interface TestCaseSection {
  /** Section identifier */
  readonly id: string;
  /** Display title */
  readonly title: string;
  /** Markdown content */
  readonly content: string;
  /** Whether the tester can edit this section */
  readonly editable: boolean;
  /** Section role for UI rendering hints */
  readonly role: SectionRole;
}

export type SectionRole =
  | 'objective'
  | 'prerequisites'
  | 'steps'
  | 'expected'
  | 'actual-result'
  | 'evidence'
  | 'diagnostics'
  | 'notes'
  | 'custom';

export interface ParsedTestCase {
  /** Whether this work item body matches the test case template format */
  readonly isTestCase: boolean;
  /** Parsed sections in order */
  readonly sections: readonly TestCaseSection[];
  /** Raw body content (for non-test-case items) */
  readonly rawBody: string;
  /** Jam.dev recording URLs found in the body */
  readonly jamLinks: readonly JamLink[];
  /** Screenshot/attachment references found in the body */
  readonly attachmentRefs: readonly AttachmentRef[];
}

export interface JamLink {
  readonly url: string;
  readonly label: string;
}

export interface AttachmentRef {
  readonly filename: string;
  readonly url: string;
  readonly isImage: boolean;
}

export interface TestCaseCreateOptions {
  readonly objective: string;
  readonly prerequisites?: string;
  readonly steps: readonly string[];
  readonly expectedResult: string;
}

// ============================================
// Section Metadata
// ============================================

interface SectionMeta {
  readonly id: string;
  readonly title: string;
  readonly role: SectionRole;
  readonly editable: boolean;
  readonly placeholder: string;
}

const SECTION_DEFINITIONS: readonly SectionMeta[] = [
  {
    id: 'objective',
    title: 'Objective',
    role: 'objective',
    editable: false,
    placeholder: 'What this test case verifies.',
  },
  {
    id: 'prerequisites',
    title: 'Prerequisites',
    role: 'prerequisites',
    editable: false,
    placeholder: 'What needs to be in place before testing.',
  },
  {
    id: 'steps',
    title: 'Steps',
    role: 'steps',
    editable: false,
    placeholder: '1. First step\n2. Second step',
  },
  {
    id: 'expected-result',
    title: 'Expected Result',
    role: 'expected',
    editable: false,
    placeholder: 'What should happen when the test passes.',
  },
  {
    id: 'actual-result',
    title: 'Actual Result',
    role: 'actual-result',
    editable: true,
    placeholder: 'Describe what actually happened during testing.',
  },
  {
    id: 'evidence',
    title: 'Evidence',
    role: 'evidence',
    editable: true,
    placeholder: 'Attach a Jam recording or screenshot.',
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    role: 'diagnostics',
    editable: false,
    placeholder: 'Auto-populated by Traklet.',
  },
  {
    id: 'notes',
    title: 'Notes',
    role: 'notes',
    editable: true,
    placeholder: 'Any additional observations.',
  },
] as const;

// ============================================
// Markers
// ============================================

// Markers are wrapped in hidden spans so they're invisible in Azure DevOps
// and GitHub's markdown rendering, but still parseable by Traklet.
// We support both raw curly-brace format (legacy) and hidden span format (new).
const TEMPLATE_MARKER_NEW = '<span style="display:none">{traklet:test-case}</span>';
const TEMPLATE_MARKER_LEGACY = '{traklet:test-case}';
const SECTION_OPEN_RE = /(?:<span[^>]*>)?\{traklet:section:([a-z-]+)\}(?:<\/span>)?/;
const SECTION_CLOSE_RE = /(?:<span[^>]*>)?\{\/traklet:section:([a-z-]+)\}(?:<\/span>)?/;
const JAM_LINK_RE = /\[([^\]]*)\]\((https:\/\/jam\.dev\/c\/[^\s)]+)\)/g;
const JAM_URL_BARE_RE = /(?:^|\s)(https:\/\/jam\.dev\/c\/[^\s)]+)/g;
const ATTACHMENT_IMG_RE = /!\[([^\]]*)\]\(([^\s)]+)\)/g;

// ============================================
// Parser
// ============================================

export function parseTestCaseBody(body: string): ParsedTestCase {
  const isTestCase = body.includes(TEMPLATE_MARKER_LEGACY) || body.includes(TEMPLATE_MARKER_NEW) || body.includes('traklet:section:');

  if (!isTestCase) {
    return {
      isTestCase: false,
      sections: [],
      rawBody: body,
      jamLinks: extractJamLinks(body),
      attachmentRefs: extractAttachmentRefs(body),
    };
  }

  const sections = parseSections(body);
  const jamLinks = extractJamLinks(body);
  const attachmentRefs = extractAttachmentRefs(body);

  return {
    isTestCase: true,
    sections,
    rawBody: body,
    jamLinks,
    attachmentRefs,
  };
}

function parseSections(body: string): TestCaseSection[] {
  const sections: TestCaseSection[] = [];
  const lines = body.split('\n');
  let currentSectionId: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for section open marker
    const openMatch = SECTION_OPEN_RE.exec(line);
    if (openMatch) {
      // Close any previous section
      if (currentSectionId) {
        sections.push(buildSection(currentSectionId, currentContent));
      }
      currentSectionId = openMatch[1]!;
      currentContent = [];
      continue;
    }

    // Check for section close marker
    const closeMatch = SECTION_CLOSE_RE.exec(line);
    if (closeMatch) {
      if (currentSectionId === closeMatch[1]) {
        sections.push(buildSection(currentSectionId, currentContent));
        currentSectionId = null;
        currentContent = [];
      }
      continue;
    }

    // Skip the template marker line
    if (line.trim() === TEMPLATE_MARKER_LEGACY.trim() || line.includes(TEMPLATE_MARKER_LEGACY) || line.includes('{traklet:test-case}')) {
      continue;
    }

    // Accumulate content
    if (currentSectionId !== null) {
      currentContent.push(line);
    }
  }

  // Close any trailing section
  if (currentSectionId) {
    sections.push(buildSection(currentSectionId, currentContent));
  }

  return sections;
}

function buildSection(id: string, contentLines: string[]): TestCaseSection {
  // Strip leading/trailing empty lines and the section heading if it matches
  let content = contentLines.join('\n').trim();

  const meta = SECTION_DEFINITIONS.find((s) => s.id === id);

  // Remove the heading line if it matches the section title (e.g., "## Objective")
  if (meta) {
    const headingRe = new RegExp(`^##\\s*${escapeRegex(meta.title)}\\s*$`, 'm');
    content = content.replace(headingRe, '').trim();
  }

  return {
    id,
    title: meta?.title ?? formatSectionId(id),
    content,
    editable: meta?.editable ?? true,
    role: meta?.role ?? 'custom',
  };
}

// ============================================
// Composer
// ============================================

/** Wrap a marker in a hidden span so it's invisible in ADO/GitHub markdown rendering */
function hidden(marker: string): string {
  return `<span style="display:none">${marker}</span>`;
}

export function composeTestCaseBody(options: TestCaseCreateOptions): string {
  const lines: string[] = [];

  lines.push(hidden('{traklet:test-case}'));
  lines.push('');

  // Objective
  lines.push(hidden('{traklet:section:objective}'));
  lines.push('## Objective');
  lines.push(options.objective);
  lines.push(hidden('{/traklet:section:objective}'));
  lines.push('');

  // Prerequisites
  if (options.prerequisites) {
    lines.push(hidden('{traklet:section:prerequisites}'));
    lines.push('## Prerequisites');
    lines.push(options.prerequisites);
    lines.push(hidden('{/traklet:section:prerequisites}'));
    lines.push('');
  }

  // Steps
  lines.push(hidden('{traklet:section:steps}'));
  lines.push('## Steps');
  options.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push(hidden('{/traklet:section:steps}'));
  lines.push('');

  // Expected Result
  lines.push(hidden('{traklet:section:expected-result}'));
  lines.push('## Expected Result');
  lines.push(options.expectedResult);
  lines.push(hidden('{/traklet:section:expected-result}'));
  lines.push('');

  // Actual Result (editable by tester)
  lines.push(hidden('{traklet:section:actual-result}'));
  lines.push('## Actual Result');
  lines.push('_Not yet tested._');
  lines.push(hidden('{/traklet:section:actual-result}'));
  lines.push('');

  // Evidence (editable by tester)
  lines.push(hidden('{traklet:section:evidence}'));
  lines.push('## Evidence');
  lines.push('_No recordings or screenshots attached yet._');
  lines.push('');
  lines.push('> **Tip:** Use [Jam.dev](https://jam.dev) to record your testing session, then paste the link here.');
  lines.push(hidden('{/traklet:section:evidence}'));
  lines.push('');

  // Diagnostics (auto-populated)
  lines.push(hidden('{traklet:section:diagnostics}'));
  lines.push('## Diagnostics');
  lines.push('_Diagnostics will be auto-attached when submitting results._');
  lines.push(hidden('{/traklet:section:diagnostics}'));
  lines.push('');

  // Notes (editable)
  lines.push(hidden('{traklet:section:notes}'));
  lines.push('## Notes');
  lines.push('');
  lines.push(hidden('{/traklet:section:notes}'));

  return lines.join('\n');
}

/**
 * Update a specific section's content in an existing test case body.
 * Preserves all other sections and content.
 */
export function updateSection(body: string, sectionId: string, newContent: string): string {
  const openMarker = `{traklet:section:${sectionId}}`;
  const closeMarker = `{/traklet:section:${sectionId}}`;

  const openIdx = body.indexOf(openMarker);
  const closeIdx = body.indexOf(closeMarker);

  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    // Section not found — append it with hidden markers
    const meta = SECTION_DEFINITIONS.find((s) => s.id === sectionId);
    const title = meta?.title ?? formatSectionId(sectionId);
    return (
      body +
      `\n\n${hidden(openMarker)}\n## ${title}\n${newContent}\n${hidden(closeMarker)}`
    );
  }

  const before = body.substring(0, openIdx + openMarker.length);
  const after = body.substring(closeIdx);
  const meta = SECTION_DEFINITIONS.find((s) => s.id === sectionId);
  const title = meta?.title ?? formatSectionId(sectionId);

  return `${before}\n## ${title}\n${newContent}\n${after}`;
}

/**
 * Insert a Jam.dev link into the evidence section
 */
export function addJamLink(body: string, jamUrl: string, label?: string): string {
  const displayLabel = label ?? 'View Jam Recording';
  const jamMarkdown = `[${displayLabel}](${jamUrl})`;

  // Find existing evidence section
  const parsed = parseTestCaseBody(body);
  const evidenceSection = parsed.sections.find((s) => s.id === 'evidence');

  if (!evidenceSection) {
    // No evidence section — add one with the Jam link
    return updateSection(body, 'evidence', `### Jam Recording\n${jamMarkdown}`);
  }

  // Replace the placeholder or append
  let newContent = evidenceSection.content;
  if (newContent.includes('_No recordings') || newContent.includes('_Not yet')) {
    newContent = `### Jam Recording\n${jamMarkdown}`;
  } else if (newContent.includes('### Jam Recording')) {
    // Append below existing Jam section
    newContent = newContent.replace(
      /(### Jam Recording\n)/,
      `$1${jamMarkdown}\n`
    );
  } else {
    newContent = `### Jam Recording\n${jamMarkdown}\n\n${newContent}`;
  }

  // Re-add the tip
  if (!newContent.includes('Tip:')) {
    newContent += '\n\n> **Tip:** Use [Jam.dev](https://jam.dev) to record your testing session, then paste the link here.';
  }

  return updateSection(body, 'evidence', newContent);
}

/**
 * Insert diagnostic markdown into the diagnostics section
 */
export function addDiagnostics(body: string, diagnosticMarkdown: string): string {
  return updateSection(body, 'diagnostics', diagnosticMarkdown);
}

// ============================================
// Link/Reference Extractors
// ============================================

function extractJamLinks(body: string): JamLink[] {
  const links: JamLink[] = [];
  const seen = new Set<string>();

  // Markdown links: [label](https://jam.dev/c/...)
  let match: RegExpExecArray | null;
  const mdRe = new RegExp(JAM_LINK_RE.source, 'g');
  while ((match = mdRe.exec(body)) !== null) {
    const url = match[2]!;
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, label: match[1] || 'Jam Recording' });
    }
  }

  // Bare URLs
  const bareRe = new RegExp(JAM_URL_BARE_RE.source, 'g');
  while ((match = bareRe.exec(body)) !== null) {
    const url = match[1]!;
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, label: 'Jam Recording' });
    }
  }

  return links;
}

function extractAttachmentRefs(body: string): AttachmentRef[] {
  const refs: AttachmentRef[] = [];
  let match: RegExpExecArray | null;
  const imgRe = new RegExp(ATTACHMENT_IMG_RE.source, 'g');

  while ((match = imgRe.exec(body)) !== null) {
    const filename = match[1] || match[2]!.split('/').pop() || 'image';
    const url = match[2]!;
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

    refs.push({
      filename,
      url,
      isImage: imageExts.includes(ext) || url.includes('image'),
    });
  }

  return refs;
}

// ============================================
// Helpers
// ============================================

function formatSectionId(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the section definitions (for UI rendering hints)
 */
export function getSectionDefinitions(): readonly SectionMeta[] {
  return SECTION_DEFINITIONS;
}
