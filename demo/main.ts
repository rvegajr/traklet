/**
 * Demo entry point - initializes Traklet with LocalStorage adapter
 * and seeds sample test case data for UX testing.
 */

import { Traklet } from '../src/Traklet';
import { composeTestCaseBody } from '../src/core/TestCaseTemplate';
import type { TrakletInstance } from '../src/Traklet';

// Import Lit skin to register web components
import '../skins/lit/components/TrakletWidget';

const PROJECT_ID = 'flight-deck';

async function initDemo(): Promise<void> {
  // Initialize Traklet with localStorage adapter
  const instance = await Traklet.init({
    adapter: 'localStorage',
    projects: [
      { id: PROJECT_ID, name: 'Flight Deck Pro', description: 'Main application' },
    ],
    user: {
      email: 'tester@sji.com',
      name: 'QA Tester',
    },
    position: 'bottom-right',
    collectDiagnostics: true,
  });

  // Seed sample issues through the form presenter
  await seedSampleData(instance);

  // Create and mount the widget
  const widget = document.createElement('traklet-widget');
  widget.setAttribute('position', 'bottom-right');
  widget.setAttribute('data-traklet-widget', '');
  (widget as unknown as { instance: TrakletInstance }).instance = instance;
  document.body.appendChild(widget);

  console.log('Traklet demo initialized.');
}

async function seedSampleData(instance: TrakletInstance): Promise<void> {
  const form = instance.getIssueFormPresenter();

  const issues = [
    {
      title: 'TC-001: Verify flight status updates in real-time',
      body: composeTestCaseBody({
        objective: 'Confirm that flight status changes (On Time, Delayed, Boarding) update on the dashboard without requiring a page refresh.',
        prerequisites: 'At least 3 active flights visible on the dashboard.',
        steps: [
          'Open the Flight Deck dashboard',
          'Note the current status of flight SJ-101',
          'Wait 30 seconds or trigger a status change from the admin panel',
          'Observe the dashboard for automatic updates',
        ],
        expectedResult: 'Status pill updates within 5 seconds without page reload. No flickering or layout shift.',
      }),
      labels: ['test-case'],
      priority: 'high',
    },
    {
      title: 'TC-002: Export flight data to CSV',
      body: composeTestCaseBody({
        objective: 'Verify that the CSV export includes all visible columns with correct headers and data matching the filtered view.',
        prerequisites: 'Sample dataset loaded with at least 10 flights.\nUser has export permissions.',
        steps: [
          'Navigate to the Flights page',
          'Apply filter: Date Range = Last 7 Days',
          'Click the Export button in the toolbar',
          'Select CSV from the format dropdown',
          'Click Download',
          'Open the downloaded file',
        ],
        expectedResult: 'CSV file downloads immediately.\nHeaders match visible columns.\nData matches filtered view.',
      }),
      labels: ['test-case'],
      priority: 'medium',
    },
    {
      title: 'TC-003: Crew utilization percentage calculation',
      body: composeTestCaseBody({
        objective: 'Verify the crew utilization metric on the dashboard card matches the calculated value from the Crew Management page.',
        steps: [
          'Note the Crew Utilization percentage on the dashboard',
          'Navigate to Reports > Crew Management',
          'Calculate: (assigned crew hours / total available hours) * 100',
          'Compare with the dashboard value',
        ],
        expectedResult: 'Dashboard percentage matches the manual calculation within 0.5% margin.',
      }),
      labels: ['test-case'],
      priority: 'low',
    },
    {
      title: 'BUG: Delayed flight count includes cancelled flights',
      body: 'The "Delayed" card on the dashboard shows 3, but one of those (SJ-900) was actually cancelled, not delayed.\n\nExpected: Cancelled flights should not count as delayed.\n\nhttps://jam.dev/c/sample-bug-recording',
      labels: ['bug'],
      priority: 'high',
    },
    {
      title: 'TC-004: Dashboard loads within 3 seconds',
      body: composeTestCaseBody({
        objective: 'Verify the dashboard fully renders (all cards + table) within 3 seconds on a standard connection.',
        prerequisites: 'Clear browser cache.\nUse Chrome DevTools Network throttling set to "Fast 3G" for consistent results.',
        steps: [
          'Open Chrome DevTools > Network tab',
          'Set throttling to "Fast 3G"',
          'Navigate to the Dashboard page',
          'Observe the DOMContentLoaded and Load timings',
          'Verify all 4 metric cards and the flights table are visible',
        ],
        expectedResult: 'DOMContentLoaded < 2s.\nFull load < 3s.\nAll content visible without scrolling on 1440x900.',
      }),
      labels: ['test-case'],
      priority: 'medium',
    },
  ];

  for (const issue of issues) {
    await form.initCreate();
    form.updateField('title', issue.title);
    form.updateField('body', issue.body);
    if (issue.priority) {
      form.updateField('priority', issue.priority);
    }
    if (issue.labels) {
      form.updateField('labels', issue.labels);
    }
    await form.submit();
  }

  // Navigate back to list view and reload
  instance.getWidgetPresenter().navigateTo('list');
  await instance.getIssueListPresenter().loadIssues();
}

// Boot
initDemo().catch(console.error);
