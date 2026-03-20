---
id: TC-010
title: Dashboard loads with all cards and table
priority: high
labels:
  - dashboard
  - performance
depends:
  - TC-001
suite: dashboard
backend-id: '12'
last-synced: '2026-03-20T03:17:43.238Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Verify the dashboard fully renders with all metric cards and the
flights table within 3 seconds.
{/traklet:section:objective}

{traklet:section:prerequisites}
## Prerequisites
- User is logged in (TC-001)
- At least 5 flights in the system
{/traklet:section:prerequisites}

{traklet:section:steps}
## Steps
1. Log in and navigate to /dashboard
2. Observe all 4 metric cards (Active Flights, On-Time Rate, Delayed, Crew Utilization)
3. Observe the flights table below the cards
4. Check that data is populated (not loading spinners)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
All 4 cards show numeric values.
Flights table shows at least 5 rows.
Total load time < 3 seconds.
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
