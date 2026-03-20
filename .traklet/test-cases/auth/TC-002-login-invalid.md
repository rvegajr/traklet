---
id: TC-002
title: Login with invalid credentials shows error
priority: high
labels:
  - auth
  - negative
suite: auth
backend-id: '11'
last-synced: '2026-03-20T03:17:43.058Z'
---

{traklet:test-case}

{traklet:section:objective}
## Objective
Verify that invalid credentials produce a clear error message
without revealing whether the email or password was wrong.
{/traklet:section:objective}

{traklet:section:steps}
## Steps
1. Navigate to /login
2. Enter a valid email address
3. Enter an incorrect password
4. Click "Sign In"
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
Error message: "Invalid email or password."
No redirect occurs. User stays on /login.
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
