---
id: TC-020
title: Export flight data to CSV
priority: medium
labels:
  - export
  - data
depends:
  - TC-010
suite: export
backend-id: '14'
last-synced: '2026-03-20T03:17:43.457Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Verify the CSV export includes all visible columns with correct
headers and data matching the filtered view.
{/traklet:section:objective}

{traklet:section:prerequisites}
## Prerequisites
- Dashboard loaded with flight data (TC-010)
- User has export permissions
{/traklet:section:prerequisites}

{traklet:section:steps}
## Steps
1. Navigate to the Flights page
2. Apply filter: Date Range = Last 7 Days
3. Click the "Export" button in the toolbar
4. Select "CSV" from the format dropdown
5. Click "Download"
6. Open the downloaded file
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
CSV downloads immediately.
Headers match all visible columns.
Row count matches filtered view.
Special characters properly escaped.
{/traklet:section:expected-result}

{traklet:section:actual-result}
## Actual Result
_Not yet tested._
{/traklet:section:actual-result}

{traklet:section:evidence}
## Evidence
{/traklet:section:evidence}

{traklet:section:notes}
## Notes
{/traklet:section:notes}
