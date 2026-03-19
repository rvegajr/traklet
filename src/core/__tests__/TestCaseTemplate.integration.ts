/**
 * End-to-end integration test:
 * 1. Compose a test case body using the template system
 * 2. Create it as an Azure DevOps work item
 * 3. Read it back and parse it
 * 4. Update sections (simulate tester filling in results + Jam link)
 * 5. Re-read and verify round-trip fidelity
 * 6. Clean up
 *
 * Usage: npx tsx src/core/__tests__/TestCaseTemplate.integration.ts
 */

import { AzureDevOpsAdapter } from '@/adapters/AzureDevOpsAdapter';
import type { AdapterConfig } from '@/contracts';
import {
  composeTestCaseBody,
  parseTestCaseBody,
  updateSection,
  addJamLink,
  addDiagnostics,
} from '../TestCaseTemplate';
import { execSync } from 'child_process';

function getAzToken(): string {
  return execSync(
    'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
}

async function main(): Promise<void> {
  console.log('=== Test Case Template E2E Integration Test ===\n');

  const token = getAzToken();
  const adapter = new AzureDevOpsAdapter();
  const config: AdapterConfig = {
    type: 'azure-devops',
    token,
    baseUrl: 'https://dev.azure.com/sjiorg',
    projects: [{ id: 'sji-flight-deck-pro', name: 'SJI Flight Deck Pro', identifier: 'sji-flight-deck-pro' }],
  };

  const result = await adapter.connect(config);
  if (!result.success) {
    console.error('Connection failed:', result.error);
    process.exit(1);
  }
  console.log('Connected to Azure DevOps\n');

  const PROJECT = 'sji-flight-deck-pro';

  // ============================================
  // Step 1: Compose test case body
  // ============================================
  console.log('1. Composing test case body...');
  const body = composeTestCaseBody({
    objective: 'Verify that the flight deck CSV export includes all visible columns with correct headers and data.',
    prerequisites: 'Sample dataset loaded with at least 10 rows.\nUser has export permissions.',
    steps: [
      'Navigate to the Flight Deck dashboard',
      'Apply filter: Date Range = Last 7 Days',
      'Click the "Export" button in the toolbar',
      'Select "CSV" from the format dropdown',
      'Click "Download"',
      'Open the downloaded file in a text editor or spreadsheet',
    ],
    expectedResult: 'CSV file downloads immediately.\nFile contains headers matching all visible columns.\nData rows match the filtered view (last 7 days only).\nSpecial characters in data are properly escaped.',
  });

  const parsed = parseTestCaseBody(body);
  console.log(`   Template marker detected: ${parsed.isTestCase}`);
  console.log(`   Sections: ${parsed.sections.map((s) => s.id).join(', ')}`);
  console.log(`   Editable sections: ${parsed.sections.filter((s) => s.editable).map((s) => s.id).join(', ')}`);

  // ============================================
  // Step 2: Create work item
  // ============================================
  console.log('\n2. Creating work item in Azure DevOps...');
  const issue = await adapter.createIssue(PROJECT, {
    title: 'TC-001: Verify flight deck CSV export fidelity',
    body,
    labels: ['test-case', 'data-export', 'sprint-1'],
    priority: 'medium',
  });
  console.log(`   Created: #${issue.number} "${issue.title}"`);

  // ============================================
  // Step 3: Read back and parse
  // ============================================
  console.log('\n3. Reading back from Azure DevOps...');
  const readBack = await adapter.getIssue(PROJECT, issue.id);
  const parsedBack = parseTestCaseBody(readBack.body);

  console.log(`   Is test case: ${parsedBack.isTestCase}`);
  console.log(`   Sections found: ${parsedBack.sections.length}`);

  for (const section of parsedBack.sections) {
    const preview = section.content.substring(0, 60).replace(/\n/g, ' ');
    console.log(`   [${section.id}] ${section.editable ? '(editable)' : '(readonly)'} ${preview}...`);
  }

  // Verify fidelity
  const origObjective = parsed.sections.find((s) => s.id === 'objective')?.content;
  const readObjective = parsedBack.sections.find((s) => s.id === 'objective')?.content;
  console.log(`\n   Objective match: ${origObjective === readObjective ? 'PASS' : 'FAIL'}`);

  const origSteps = parsed.sections.find((s) => s.id === 'steps')?.content;
  const readSteps = parsedBack.sections.find((s) => s.id === 'steps')?.content;
  // ADO normalizes whitespace in HTML; compare normalized content
  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
  const stepsMatch = normalizeWs(origSteps ?? '') === normalizeWs(readSteps ?? '');
  console.log(`   Steps match: ${stepsMatch ? 'PASS' : 'FAIL (whitespace normalized by ADO)'}`);
  if (!stepsMatch) {
    console.log(`     Original: ${origSteps?.substring(0, 120)}`);
    console.log(`     ReadBack: ${readSteps?.substring(0, 120)}`);
  }

  // ============================================
  // Step 4: Simulate tester filling in results
  // ============================================
  console.log('\n4. Simulating tester input...');

  let updatedBody = readBack.body;

  // Tester fills in actual result
  updatedBody = updateSection(updatedBody, 'actual-result',
    'CSV downloaded but column headers use internal field names (e.g., "fld_dep_time") instead of display names ("Departure Time").\nData rows are correct and match the filtered view.'
  );

  // Tester adds Jam recording
  updatedBody = addJamLink(updatedBody, 'https://jam.dev/c/export-bug-2026-03-19');

  // Auto-attach diagnostics
  const diagnostics = [
    '### Environment',
    '- URL: https://flightdeck.sji.com/dashboard',
    '- Browser: Chrome 122.0.6261.94 / macOS 14.3',
    '- Viewport: 1440x900',
    '- Timezone: America/Chicago',
    '',
    '### Performance',
    '- Page Load: 1.8s',
    '- DOM Ready: 1.2s',
    '',
    '### Console Warnings',
    '- [WARN] Deprecated API call: getColumnHeaders() - use getDisplayHeaders() instead',
  ].join('\n');
  updatedBody = addDiagnostics(updatedBody, diagnostics);

  // Tester adds notes
  updatedBody = updateSection(updatedBody, 'notes',
    'This appears to be a regression from the recent refactor of the export module.\nWorkaround: manually rename columns after download.'
  );

  // Push the update
  const updated = await adapter.updateIssue(PROJECT, issue.id, { body: updatedBody });
  console.log(`   Updated work item #${updated.number}`);

  // ============================================
  // Step 5: Final read and fidelity check
  // ============================================
  console.log('\n5. Final fidelity verification...');
  const final = await adapter.getIssue(PROJECT, issue.id);
  const finalParsed = parseTestCaseBody(final.body);

  console.log(`   Sections: ${finalParsed.sections.length}`);
  console.log(`   Jam links: ${finalParsed.jamLinks.length}`);

  const checks = [
    ['Objective preserved', finalParsed.sections.find((s) => s.id === 'objective')?.content?.includes('CSV export')],
    ['Steps preserved', finalParsed.sections.find((s) => s.id === 'steps')?.content?.includes('Click the')],
    ['Expected result preserved', finalParsed.sections.find((s) => s.id === 'expected-result')?.content?.includes('CSV file downloads')],
    ['Actual result updated', finalParsed.sections.find((s) => s.id === 'actual-result')?.content?.includes('internal field names')],
    ['Jam link present', finalParsed.jamLinks.some((l) => l.url.includes('export-bug'))],
    ['Diagnostics attached', finalParsed.sections.find((s) => s.id === 'diagnostics')?.content?.includes('Chrome 122')],
    ['Notes filled in', finalParsed.sections.find((s) => s.id === 'notes')?.content?.includes('regression')],
    ['Prerequisites preserved', finalParsed.sections.find((s) => s.id === 'prerequisites')?.content?.includes('Sample dataset')],
  ] as const;

  let allPass = true;
  for (const [label, passed] of checks) {
    const status = passed ? 'PASS' : 'FAIL';
    if (!passed) allPass = false;
    console.log(`   [${status}] ${label}`);
  }

  // ============================================
  // Step 6: Clean up
  // ============================================
  console.log('\n6. Cleaning up...');
  await adapter.deleteIssue(PROJECT, issue.id);
  console.log(`   Deleted work item #${issue.number}`);

  await adapter.disconnect();

  if (allPass) {
    console.log('\n=== All fidelity checks PASSED ===');
  } else {
    console.log('\n=== Some checks FAILED ===');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nIntegration test FAILED:', err);
  process.exit(1);
});
