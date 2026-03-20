/**
 * Lightweight markdown-to-HTML renderer for Traklet widget.
 * Handles the subset of markdown used in test case sections.
 * No external dependencies.
 */

/**
 * Convert markdown text to sanitized HTML.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  let html = escapeHtml(text);

  // Ordered lists: lines starting with "1. ", "2. ", etc.
  html = html.replace(
    /^(\d+)\.\s+(.+)$/gm,
    '<li value="$1">$2</li>'
  );
  html = html.replace(
    /(<li[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ol>${match}</ol>`
  );

  // Unordered lists: lines starting with "- " or "* "
  html = html.replace(
    /^[-*]\s+(.+)$/gm,
    '<li>$1</li>'
  );
  html = html.replace(
    /(<li>[\s\S]*?<\/li>\n?)+/g,
    (match) => {
      // Don't double-wrap if already in <ol>
      if (match.includes('value=')) return match;
      return `<ul>${match}</ul>`;
    }
  );

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not inside words)
  html = html.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');
  html = html.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<em>$1</em>');

  // Inline code: `code`
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+?)\]\(([^)]+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Images: ![alt](url)
  html = html.replace(
    /!\[([^\]]*?)\]\(([^)]+?)\)/g,
    '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 4px; margin: 4px 0;" />'
  );

  // Line breaks: double newline = paragraph, single = <br>
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs and list artifacts
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<[ou]l>)/g, '$1');
  html = html.replace(/(<\/[ou]l>)<\/p>/g, '$1');
  html = html.replace(/<br><li/g, '<li');
  html = html.replace(/<\/li><br>/g, '</li>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
