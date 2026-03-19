/**
 * Live integration test for AzureDevOpsAdapter
 * Runs against the real sji-flight-deck-pro project
 *
 * Usage: npx tsx src/adapters/__tests__/AzureDevOpsAdapter.integration.ts
 */

import { AzureDevOpsAdapter } from '../AzureDevOpsAdapter';
import type { AdapterConfig } from '@/contracts';
import { execSync } from 'child_process';

function getAzToken(): string {
  const token = execSync(
    'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  return token;
}

async function main(): Promise<void> {
  console.log('=== Azure DevOps Adapter Integration Test ===\n');

  const token = getAzToken();
  console.log(`Token acquired (${token.length} chars)\n`);

  const adapter = new AzureDevOpsAdapter();
  const config: AdapterConfig = {
    type: 'azure-devops',
    token,
    baseUrl: 'https://dev.azure.com/sjiorg',
    projects: [
      {
        id: 'sji-flight-deck-pro',
        name: 'SJI Flight Deck Pro',
        identifier: 'sji-flight-deck-pro',
      },
    ],
  };

  // 1. Connect
  console.log('1. Connecting...');
  const result = await adapter.connect(config);
  if (!result.success) {
    console.error('   FAILED:', result.error);
    process.exit(1);
  }
  console.log('   Connected. Projects:', result.projects?.map((p) => p.name).join(', '));

  // 2. Get issues
  console.log('\n2. Fetching issues...');
  const issues = await adapter.getIssues('sji-flight-deck-pro');
  console.log(`   Found ${issues.total} issues:`);
  for (const issue of issues.items) {
    console.log(
      `   [#${issue.number}] ${issue.title} (${issue.state}, priority: ${issue.priority ?? 'none'})`
    );
    console.log(`     Tags: ${issue.labels.map((l) => l.name).join(', ') || 'none'}`);
    console.log(`     Created by: ${issue.createdBy.name} <${issue.createdBy.email}>`);
    console.log(`     Comments: ${issue.commentCount}`);
  }

  // 3. Get single issue
  if (issues.items.length > 0) {
    const firstId = issues.items[0]!.id;
    console.log(`\n3. Fetching issue #${firstId}...`);
    const issue = await adapter.getIssue('sji-flight-deck-pro', firstId);
    console.log(`   Title: ${issue.title}`);
    console.log(`   Body: ${issue.body?.substring(0, 100)}...`);
    console.log(`   Metadata:`, issue.metadata);
  }

  // 4. Get comments
  console.log('\n4. Fetching comments for issue #1...');
  const comments = await adapter.getComments('sji-flight-deck-pro', '1');
  console.log(`   Found ${comments.length} comments:`);
  for (const comment of comments) {
    console.log(`   [${comment.id}] ${comment.author.name}: ${comment.body.substring(0, 80)}`);
  }

  // 5. Get labels
  console.log('\n5. Fetching labels (tags)...');
  const labels = await adapter.getLabels('sji-flight-deck-pro');
  console.log(`   Found ${labels.length} tags: ${labels.map((l) => l.name).join(', ')}`);

  // 6. Filter by tag
  console.log('\n6. Filtering by tag "test-case"...');
  const testCases = await adapter.getIssues('sji-flight-deck-pro', {
    labels: ['test-case'],
  });
  console.log(`   Found ${testCases.total} test cases:`);
  for (const tc of testCases.items) {
    console.log(`   [#${tc.number}] ${tc.title}`);
  }

  // 7. Create a test issue
  console.log('\n7. Creating test issue...');
  const created = await adapter.createIssue('sji-flight-deck-pro', {
    title: 'Integration Test - Auto Created',
    body: 'This issue was created by the Traklet adapter integration test.\nIt can be safely deleted.',
    labels: ['test-case', 'auto-created'],
    priority: 'low',
  });
  console.log(`   Created issue #${created.number}: ${created.title}`);

  // 8. Update the issue
  console.log('\n8. Updating test issue...');
  const updated = await adapter.updateIssue('sji-flight-deck-pro', created.id, {
    title: 'Integration Test - Updated Title',
    state: 'closed',
  });
  console.log(`   Updated: ${updated.title} (state: ${updated.state})`);

  // 9. Add comment
  console.log('\n9. Adding comment to test issue...');
  const comment = await adapter.addComment('sji-flight-deck-pro', created.id, {
    body: 'Automated test comment from Traklet adapter integration test.',
  });
  console.log(`   Comment added: ${comment.id} by ${comment.author.name}`);

  // 10. Delete the test issue
  console.log('\n10. Deleting test issue...');
  await adapter.deleteIssue('sji-flight-deck-pro', created.id);
  console.log('    Deleted successfully.');

  // 11. Validate token
  console.log('\n11. Validating token...');
  const isValid = await adapter.validateToken();
  console.log(`    Token valid: ${isValid}`);

  // Disconnect
  await adapter.disconnect();
  console.log('\n=== All integration tests passed ===');
}

main().catch((err) => {
  console.error('\nIntegration test FAILED:', err);
  process.exit(1);
});
