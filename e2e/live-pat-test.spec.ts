import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Live PAT token test against Azure DevOps.
 * Requires TRAKLET_PAT environment variable.
 * Run: TRAKLET_PAT=your-token npx playwright test e2e/live-pat-test.spec.ts
 */

// Token must be provided via TRAKLET_PAT environment variable.
// Never hardcode tokens in test files.
const PAT = process.env['TRAKLET_PAT'] ?? '';
const ORG = process.env['TRAKLET_ADO_URL'] ?? 'https://dev.azure.com/sjiorg';
const PROJECT = process.env['TRAKLET_PROJECT'] ?? 'sji-flight-deck-pro';

test.describe('Live Azure DevOps PAT Token Tests', () => {
  test.skip(!process.env['TRAKLET_PAT'], 'TRAKLET_PAT env var not set — skipping live ADO tests');

  test('Connect, list issues, and verify data', async () => {
    const result = execSync(`npx tsx -e "
      const { AzureDevOpsAdapter } = require('./src/adapters/AzureDevOpsAdapter.ts');

      async function run() {
        const adapter = new AzureDevOpsAdapter();
        const conn = await adapter.connect({
          type: 'azure-devops',
          token: '${PAT}',
          baseUrl: '${ORG}',
          projects: [{ id: '${PROJECT}', name: 'SJI Flight Deck Pro', identifier: '${PROJECT}' }],
        });

        if (!conn.success) {
          console.log(JSON.stringify({ error: conn.error }));
          return;
        }

        console.log(JSON.stringify({
          step: 'connected',
          user: conn.authenticatedUser?.name,
          email: conn.authenticatedUser?.email,
        }));

        const issues = await adapter.getIssues('${PROJECT}');
        console.log(JSON.stringify({
          step: 'listed',
          total: issues.total,
          issues: issues.items.map(i => ({
            id: i.id,
            number: i.number,
            title: i.title,
            state: i.state,
            priority: i.priority,
            labels: i.labels.map(l => l.name),
          })),
        }));

        await adapter.disconnect();
        console.log(JSON.stringify({ step: 'done' }));
      }

      run().catch(e => console.log(JSON.stringify({ error: e.message })));
    "`, { encoding: 'utf-8', timeout: 30000 }).trim();

    const lines = result.split('\n').filter(l => l.startsWith('{'));
    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.error) throw new Error(data.error);
      if (data.step === 'connected') {
        console.log(`Connected as: ${data.user} <${data.email}>`);
        expect(data.user).toBeTruthy();
      }
      if (data.step === 'listed') {
        console.log(`Found ${data.total} work items`);
        expect(data.total).toBeGreaterThan(0);
      }
    }
  });

  test('Create issue, add comment, verify, then delete', async () => {
    const timestamp = new Date().toISOString().slice(0, 19);

    const result = execSync(`npx tsx -e "
      const { AzureDevOpsAdapter } = require('./src/adapters/AzureDevOpsAdapter.ts');

      async function run() {
        const adapter = new AzureDevOpsAdapter();
        await adapter.connect({
          type: 'azure-devops',
          token: '${PAT}',
          baseUrl: '${ORG}',
          projects: [{ id: '${PROJECT}', name: 'SJI Flight Deck Pro', identifier: '${PROJECT}' }],
        });

        const issue = await adapter.createIssue('${PROJECT}', {
          title: 'Playwright E2E Test - ${timestamp}',
          body: 'Automated test. Safe to delete.',
          labels: ['e2e-test'],
          priority: 'medium',
        });
        console.log(JSON.stringify({ step: 'created', number: issue.number }));

        const comment = await adapter.addComment('${PROJECT}', issue.id, {
          body: 'Automated comment',
        });
        console.log(JSON.stringify({ step: 'commented' }));

        const readBack = await adapter.getIssue('${PROJECT}', issue.id);
        console.log(JSON.stringify({ step: 'verified', comments: readBack.commentCount }));

        await adapter.deleteIssue('${PROJECT}', issue.id);
        console.log(JSON.stringify({ step: 'deleted' }));

        await adapter.disconnect();
        console.log(JSON.stringify({ step: 'done' }));
      }

      run().catch(e => console.log(JSON.stringify({ error: e.message })));
    "`, { encoding: 'utf-8', timeout: 30000 }).trim();

    const lines = result.split('\n').filter(l => l.startsWith('{'));
    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.error) throw new Error(data.error);
      if (data.step === 'created') console.log(`Created #${data.number}`);
      if (data.step === 'verified') expect(data.comments).toBeGreaterThanOrEqual(1);
      if (data.step === 'deleted') console.log('Cleaned up');
    }
  });
});
