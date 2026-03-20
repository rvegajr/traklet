---
id: TC-011
title: Flight status updates in real-time
priority: medium
labels:
  - dashboard
  - realtime
depends:
  - TC-010
suite: dashboard
backend-id: '15'
last-synced: '2026-03-20T03:17:43.467Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Confirm that flight status changes update on the dashboard without
a page refresh.
{/traklet:section:objective}

{traklet:section:prerequisites}
## Prerequisites
- Dashboard is loaded and showing flights (TC-010)
{/traklet:section:prerequisites}

{traklet:section:steps}
## Steps
1. Note the current status of a flight (e.g., SJ-101: "On Time")
2. Trigger a status change from the admin panel
3. Wait up to 10 seconds
4. Observe the dashboard
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
Status pill updates within 5 seconds.
No page reload occurs.
No layout shift or flickering.
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
