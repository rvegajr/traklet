---
id: TC-003
title: Logout clears session and redirects to login
priority: high
labels:
  - auth
depends:
  - TC-001
suite: auth
backend-id: '13'
last-synced: '2026-03-20T03:17:43.331Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Verify that clicking logout clears the session token and redirects
the user to /login.
{/traklet:section:objective}

{traklet:section:prerequisites}
## Prerequisites
- User is logged in (TC-001 must pass first)
{/traklet:section:prerequisites}

{traklet:section:steps}
## Steps
1. While logged in, click the user avatar in the header
2. Click "Log Out" from the dropdown
3. Observe the redirect
4. Try navigating directly to /dashboard
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
User is redirected to /login.
Navigating to /dashboard redirects back to /login.
No session token in cookies/localStorage.
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
