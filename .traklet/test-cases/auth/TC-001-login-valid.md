---
id: TC-001
title: Login with valid credentials
priority: critical
labels:
  - auth
  - smoke
suite: auth
backend-id: '10'
last-synced: '2026-03-20T03:17:43.030Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Verify that a user can log in with valid credentials and is
redirected to the dashboard.
{/traklet:section:objective}

{traklet:section:prerequisites}
## Prerequisites
- User account exists with known credentials
- Application is running on staging
{/traklet:section:prerequisites}

{traklet:section:steps}
## Steps
1. Navigate to /login
2. Enter valid email address
3. Enter valid password
4. Click "Sign In"
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
User is redirected to /dashboard within 2 seconds.
Profile name appears in the header.
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
