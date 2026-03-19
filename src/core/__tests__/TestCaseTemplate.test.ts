import { describe, it, expect } from 'vitest';
import {
  composeTestCaseBody,
  parseTestCaseBody,
  updateSection,
  addJamLink,
  addDiagnostics,
} from '../TestCaseTemplate';

describe('TestCaseTemplate', () => {
  describe('composeTestCaseBody', () => {
    it('should create a structured body with all sections', () => {
      const body = composeTestCaseBody({
        objective: 'Verify login redirects to dashboard',
        prerequisites: 'User account exists with valid credentials',
        steps: [
          'Navigate to /login',
          'Enter valid email and password',
          'Click Sign In',
        ],
        expectedResult: 'User is redirected to /dashboard',
      });

      expect(body).toContain('{traklet:test-case}');
      expect(body).toContain('{traklet:section:objective}');
      expect(body).toContain('Verify login redirects to dashboard');
      expect(body).toContain('{traklet:section:prerequisites}');
      expect(body).toContain('User account exists');
      expect(body).toContain('{traklet:section:steps}');
      expect(body).toContain('1. Navigate to /login');
      expect(body).toContain('2. Enter valid email and password');
      expect(body).toContain('3. Click Sign In');
      expect(body).toContain('{traklet:section:expected-result}');
      expect(body).toContain('redirected to /dashboard');
      expect(body).toContain('{traklet:section:actual-result}');
      expect(body).toContain('_Not yet tested._');
      expect(body).toContain('{traklet:section:evidence}');
      expect(body).toContain('Jam.dev');
      expect(body).toContain('{traklet:section:diagnostics}');
      expect(body).toContain('{traklet:section:notes}');
    });

    it('should omit prerequisites when not provided', () => {
      const body = composeTestCaseBody({
        objective: 'Simple test',
        steps: ['Do the thing'],
        expectedResult: 'Thing is done',
      });

      expect(body).not.toContain('{traklet:section:prerequisites}');
      expect(body).toContain('{traklet:section:steps}');
    });
  });

  describe('parseTestCaseBody', () => {
    it('should detect test case format', () => {
      const body = composeTestCaseBody({
        objective: 'Test objective',
        steps: ['Step 1'],
        expectedResult: 'Expected',
      });

      const parsed = parseTestCaseBody(body);
      expect(parsed.isTestCase).toBe(true);
      expect(parsed.sections.length).toBeGreaterThanOrEqual(6);
    });

    it('should parse all section content correctly', () => {
      const body = composeTestCaseBody({
        objective: 'Verify export works',
        prerequisites: 'Data loaded in grid',
        steps: ['Click Export', 'Select CSV'],
        expectedResult: 'CSV file downloads',
      });

      const parsed = parseTestCaseBody(body);

      const objective = parsed.sections.find((s) => s.id === 'objective');
      expect(objective?.content).toBe('Verify export works');
      expect(objective?.editable).toBe(false);
      expect(objective?.role).toBe('objective');

      const prereqs = parsed.sections.find((s) => s.id === 'prerequisites');
      expect(prereqs?.content).toBe('Data loaded in grid');

      const steps = parsed.sections.find((s) => s.id === 'steps');
      expect(steps?.content).toContain('1. Click Export');
      expect(steps?.content).toContain('2. Select CSV');

      const expected = parsed.sections.find((s) => s.id === 'expected-result');
      expect(expected?.content).toBe('CSV file downloads');

      const actual = parsed.sections.find((s) => s.id === 'actual-result');
      expect(actual?.editable).toBe(true);
    });

    it('should return isTestCase=false for plain markdown', () => {
      const parsed = parseTestCaseBody('Just a regular issue body.\n\nNothing special.');
      expect(parsed.isTestCase).toBe(false);
      expect(parsed.sections).toHaveLength(0);
      expect(parsed.rawBody).toBe('Just a regular issue body.\n\nNothing special.');
    });

    it('should extract Jam.dev links from markdown links', () => {
      const body = 'Check out [my recording](https://jam.dev/c/abc123) for details.';
      const parsed = parseTestCaseBody(body);
      expect(parsed.jamLinks).toHaveLength(1);
      expect(parsed.jamLinks[0]?.url).toBe('https://jam.dev/c/abc123');
      expect(parsed.jamLinks[0]?.label).toBe('my recording');
    });

    it('should extract bare Jam.dev URLs', () => {
      const body = 'See https://jam.dev/c/def456 for the recording.';
      const parsed = parseTestCaseBody(body);
      expect(parsed.jamLinks).toHaveLength(1);
      expect(parsed.jamLinks[0]?.url).toBe('https://jam.dev/c/def456');
    });

    it('should deduplicate Jam links', () => {
      const body =
        '[recording](https://jam.dev/c/abc123)\n\nhttps://jam.dev/c/abc123';
      const parsed = parseTestCaseBody(body);
      expect(parsed.jamLinks).toHaveLength(1);
    });

    it('should extract image attachment references', () => {
      const body = '![screenshot](https://dev.azure.com/attachment/screenshot.png)';
      const parsed = parseTestCaseBody(body);
      expect(parsed.attachmentRefs).toHaveLength(1);
      expect(parsed.attachmentRefs[0]?.isImage).toBe(true);
      expect(parsed.attachmentRefs[0]?.filename).toBe('screenshot');
    });
  });

  describe('updateSection', () => {
    it('should replace section content in existing body', () => {
      const body = composeTestCaseBody({
        objective: 'Original',
        steps: ['Step 1'],
        expectedResult: 'Expected',
      });

      const updated = updateSection(body, 'actual-result', 'Login failed with 403 error.');
      const parsed = parseTestCaseBody(updated);

      const actual = parsed.sections.find((s) => s.id === 'actual-result');
      expect(actual?.content).toBe('Login failed with 403 error.');
    });

    it('should preserve other sections when updating one', () => {
      const body = composeTestCaseBody({
        objective: 'Keep this',
        steps: ['Step 1'],
        expectedResult: 'And this',
      });

      const updated = updateSection(body, 'actual-result', 'New result');
      const parsed = parseTestCaseBody(updated);

      expect(parsed.sections.find((s) => s.id === 'objective')?.content).toBe('Keep this');
      expect(parsed.sections.find((s) => s.id === 'expected-result')?.content).toBe('And this');
    });

    it('should append section if it does not exist', () => {
      const body = '{traklet:test-case}\nSome content';
      const updated = updateSection(body, 'notes', 'Tester found a workaround.');
      expect(updated).toContain('{traklet:section:notes}');
      expect(updated).toContain('Tester found a workaround.');
    });
  });

  describe('addJamLink', () => {
    it('should add Jam link to evidence section', () => {
      const body = composeTestCaseBody({
        objective: 'Test',
        steps: ['Step'],
        expectedResult: 'Result',
      });

      const updated = addJamLink(body, 'https://jam.dev/c/test123', 'Login Bug Recording');
      const parsed = parseTestCaseBody(updated);

      expect(parsed.jamLinks).toHaveLength(1);
      expect(parsed.jamLinks[0]?.url).toBe('https://jam.dev/c/test123');

      const evidence = parsed.sections.find((s) => s.id === 'evidence');
      expect(evidence?.content).toContain('Jam Recording');
      expect(evidence?.content).toContain('jam.dev/c/test123');
    });

    it('should replace placeholder text when adding first Jam link', () => {
      const body = composeTestCaseBody({
        objective: 'Test',
        steps: ['Step'],
        expectedResult: 'Result',
      });

      const updated = addJamLink(body, 'https://jam.dev/c/abc');
      expect(updated).not.toContain('_No recordings');
    });
  });

  describe('addDiagnostics', () => {
    it('should insert diagnostic markdown into diagnostics section', () => {
      const body = composeTestCaseBody({
        objective: 'Test',
        steps: ['Step'],
        expectedResult: 'Result',
      });

      const diagnosticMd = [
        '### Environment',
        '- URL: https://app.example.com/login',
        '- Browser: Chrome 122',
        '',
        '### Console Errors',
        '- TypeError: Cannot read property redirect',
      ].join('\n');

      const updated = addDiagnostics(body, diagnosticMd);
      const parsed = parseTestCaseBody(updated);

      const diag = parsed.sections.find((s) => s.id === 'diagnostics');
      expect(diag?.content).toContain('Chrome 122');
      expect(diag?.content).toContain('TypeError');
      expect(updated).not.toContain('_Diagnostics will be auto-attached');
    });
  });

  describe('round-trip fidelity', () => {
    it('should compose, parse, update, and re-parse without data loss', () => {
      // 1. Compose
      const original = composeTestCaseBody({
        objective: 'Verify data export',
        prerequisites: 'Load sample dataset',
        steps: ['Click Export', 'Select CSV', 'Verify download'],
        expectedResult: 'CSV downloads with correct headers',
      });

      // 2. Parse
      const parsed1 = parseTestCaseBody(original);
      expect(parsed1.isTestCase).toBe(true);
      expect(parsed1.sections).toHaveLength(8); // all 8 sections (including prereqs)

      // 3. Update sections (simulating tester filling in results)
      let updated = updateSection(original, 'actual-result', 'CSV downloaded but headers were wrong.');
      updated = addJamLink(updated, 'https://jam.dev/c/export-bug-001');
      updated = addDiagnostics(updated, '### Environment\n- Browser: Firefox 121');
      updated = updateSection(updated, 'notes', 'Only happens with Unicode characters in column names.');

      // 4. Re-parse
      const parsed2 = parseTestCaseBody(updated);
      expect(parsed2.isTestCase).toBe(true);

      // Verify no data was lost
      expect(parsed2.sections.find((s) => s.id === 'objective')?.content).toBe('Verify data export');
      expect(parsed2.sections.find((s) => s.id === 'steps')?.content).toContain('Click Export');
      expect(parsed2.sections.find((s) => s.id === 'actual-result')?.content).toContain('headers were wrong');
      expect(parsed2.sections.find((s) => s.id === 'notes')?.content).toContain('Unicode');
      expect(parsed2.jamLinks).toHaveLength(1);
      expect(parsed2.sections.find((s) => s.id === 'diagnostics')?.content).toContain('Firefox');
    });
  });
});
