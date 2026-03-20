/**
 * Demo entry point
 *
 * Two modes:
 * - Demo mode (no PAT): localStorage adapter with seeded medical test cases
 * - Live mode (with PAT): Azure DevOps adapter connecting to real backend
 *
 * The PAT token is entered via the setup bar in the host page.
 * Traklet.init() handles everything — widget auto-mounts.
 */

import { Traklet } from '../src/Traklet';
import { composeTestCaseBody } from '../src/core/TestCaseTemplate';
import type { TrakletInstance } from '../src/Traklet';
import type { TrakletConfig } from '../src/core';

// Expose initTraklet globally so the HTML button can call it
(window as unknown as Record<string, unknown>)['initTraklet'] = initTraklet;

async function initTraklet(): Promise<void> {
  const patInput = document.getElementById('pat-input') as HTMLInputElement;
  const statusEl = document.getElementById('connection-status') as HTMLElement;
  const setupBar = document.getElementById('setup-bar') as HTMLElement;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;

  const pat = patInput?.value.trim();

  connectBtn.disabled = true;
  statusEl.textContent = 'Connecting...';

  try {
    // Destroy previous instance if exists
    Traklet.getInstance()?.destroy();

    let config: TrakletConfig;

    if (pat) {
      // Live mode: connect to Azure DevOps with PAT
      config = {
        adapter: 'azure-devops',
        token: pat,
        baseUrl: 'https://dev.azure.com/sjiorg',
        projects: [
          { id: 'sji-flight-deck-pro', name: 'SJI Flight Deck Pro', identifier: 'sji-flight-deck-pro' },
        ],
        position: 'bottom-right',
      };
    } else {
      // Demo mode: localStorage with seeded data
      config = {
        adapter: 'localStorage',
        projects: [
          { id: 'meditrack', name: 'MediTrack Pro' },
        ],
        user: {
          email: 'dr.chen@meditrack.com',
          name: 'Dr. Sarah Chen',
        },
        position: 'bottom-right',
      };
    }

    const instance = await Traklet.init(config);

    // Seed demo data if using localStorage
    if (!pat) {
      await seedMedicalTestCases(instance);
    }

    // Update UI
    statusEl.textContent = pat ? 'Connected to Azure DevOps' : 'Demo mode (localStorage)';
    setupBar.classList.toggle('setup-bar--connected', true);
    connectBtn.textContent = 'Reconnect';
    connectBtn.disabled = false;

    console.log(`Traklet initialized in ${pat ? 'live' : 'demo'} mode.`);
  } catch (error) {
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Retry';
  }
}

async function seedMedicalTestCases(instance: TrakletInstance): Promise<void> {
  const form = instance.getIssueFormPresenter();

  const testCases = [
    {
      title: 'TC-101: Patient admission creates correct records',
      body: composeTestCaseBody({
        objective: 'Verify that admitting a new patient creates all required records: demographic data, insurance info, room assignment, and attending physician.',
        prerequisites: 'At least one available room in the system.',
        steps: [
          'Click "+ New Patient" on the dashboard',
          'Fill in demographics: name, DOB, MRN',
          'Add insurance information',
          'Assign room 302-A and attending Dr. Chen',
          'Click "Admit Patient"',
        ],
        expectedResult: 'Patient appears in the dashboard list with correct room, condition badge (Observation), and attending physician.',
      }),
      labels: ['test-case', 'admissions'],
      priority: 'critical' as const,
    },
    {
      title: 'TC-102: Lab results notification appears in activity feed',
      body: composeTestCaseBody({
        objective: 'Verify that when lab results are ready, a notification appears in the activity feed within 30 seconds.',
        depends: ['TC-101'],
        steps: [
          'Admit a test patient (TC-101)',
          'Submit a lab order for CBC panel',
          'Mark lab results as complete in the lab system',
          'Check the activity feed on the dashboard',
        ],
        expectedResult: 'Activity feed shows "Lab results ready for [Patient Name]" within 30 seconds. No page refresh required.',
      }),
      labels: ['test-case', 'labs'],
      priority: 'high' as const,
    },
    {
      title: 'TC-103: Prescription validation blocks dangerous interactions',
      body: composeTestCaseBody({
        objective: 'Verify that the system blocks prescriptions with known dangerous drug interactions and shows a clear warning.',
        prerequisites: 'Patient with existing Warfarin prescription.',
        steps: [
          'Open patient Elena Vasquez (MRN-20843)',
          'Navigate to Prescriptions tab',
          'Attempt to add Aspirin 325mg daily',
          'Observe the interaction warning',
        ],
        expectedResult: 'System displays a red warning: "Dangerous interaction: Warfarin + Aspirin increases bleeding risk." Prescription is not saved until physician overrides.',
      }),
      labels: ['test-case', 'prescriptions', 'safety'],
      priority: 'critical' as const,
    },
    {
      title: 'TC-104: Vital signs chart renders correctly',
      body: composeTestCaseBody({
        objective: 'Verify that the vital signs chart displays heart rate, blood pressure, and temperature trends for the last 24 hours.',
        steps: [
          'Open patient Maria Gonzalez (MRN-20847)',
          'Navigate to Vitals tab',
          'Select "Last 24 hours" time range',
          'Observe the chart rendering',
        ],
        expectedResult: 'Chart shows 3 data series (HR, BP, Temp) with correct axis labels. Data points are clickable and show exact values in a tooltip.',
      }),
      labels: ['test-case', 'vitals'],
      priority: 'medium' as const,
    },
    {
      title: 'TC-105: Patient discharge updates all systems',
      body: composeTestCaseBody({
        objective: 'Verify that discharging a patient updates the room availability, removes them from active admissions count, and generates a discharge summary.',
        depends: ['TC-101'],
        steps: [
          'Open patient Aisha Johnson (MRN-20839)',
          'Click "Discharge Patient"',
          'Complete the discharge form (diagnosis, follow-up instructions)',
          'Confirm discharge',
          'Check the dashboard stats',
        ],
        expectedResult: 'Active Admissions count decreases by 1. Room 215-B shows as available. Activity feed shows discharge event. Discharge summary PDF is generated.',
      }),
      labels: ['test-case', 'discharge'],
      priority: 'high' as const,
    },
    {
      title: 'BUG: Pending Lab Results count includes completed results',
      body: 'The "Pending Lab Results" card shows 23, but at least 4 of those were completed yesterday and should no longer be counted.\n\nSteps to reproduce:\n1. Look at the Pending Lab Results stat card\n2. Click through to the full lab results list\n3. Count the ones with status "Pending"\n\nExpected: Only truly pending results counted.\nActual: Includes completed results from the last 24 hours.\n\nhttps://jam.dev/c/meditrack-lab-bug',
      labels: ['bug', 'labs'],
      priority: 'high' as const,
    },
  ];

  for (const tc of testCases) {
    await form.initCreate();
    form.updateField('title', tc.title);
    form.updateField('body', tc.body);
    form.updateField('priority', tc.priority);
    form.updateField('labels', tc.labels);
    await form.submit();
  }

  instance.getWidgetPresenter().navigateTo('list');
  await instance.getIssueListPresenter().loadIssues();
}

// Auto-init in demo mode on page load
initTraklet().catch(console.error);
