# Traklet Test Case Generation Guide for AI Agents

You are generating test cases for **Traklet**, a test case management widget. Test cases are markdown files with YAML frontmatter stored in `.traklet/test-cases/`.

## Quick Start

To generate test cases, create a JSON file and run the CLI:

```bash
npx traklet generate --from test-cases.json
npx traklet sync  # push to Azure DevOps / GitHub
```

Or create markdown files directly in `.traklet/test-cases/`.

## JSON Format (Preferred for AI Agents)

```json
[
  {
    "id": "TC-001",
    "title": "Login with valid credentials",
    "suite": "auth",
    "priority": "critical",
    "labels": ["smoke"],
    "depends": [],
    "objective": "Verify that a user can log in and reach the dashboard.",
    "prerequisites": ["User account exists", "App is running on staging"],
    "steps": [
      "Navigate to /login",
      "Enter valid email and password",
      "Click Sign In"
    ],
    "expectedResult": "User is redirected to /dashboard within 2 seconds."
  }
]
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID, format: `TC-NNN` (e.g., TC-001, TC-042) |
| `title` | string | Short description of what this test verifies |
| `suite` | string | Grouping category (e.g., auth, dashboard, export, admin) |
| `objective` | string | One sentence: what does this test prove? |
| `steps` | string[] | Numbered actions the tester performs |
| `expectedResult` | string | What should happen if the feature works correctly |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `priority` | string | "medium" | One of: critical, high, medium, low |
| `labels` | string[] | [] | Additional tags (e.g., smoke, regression, accessibility) |
| `depends` | string[] | [] | TC-IDs that must pass first (e.g., ["TC-001"]) |
| `prerequisites` | string[] | [] | Setup conditions before testing |
| `assignee` | string | null | Email of the person responsible |

## Dependency Rules

Test cases can depend on other test cases. If a dependency fails, the dependent test is marked as **blocked** in the UI.

```
auth/TC-001 (Login)           <- no dependencies, test this first
auth/TC-003 (Logout)          <- depends: [TC-001]
dashboard/TC-010 (Dashboard)  <- depends: [TC-001]
dashboard/TC-011 (Realtime)   <- depends: [TC-010]
export/TC-020 (Export PDF)    <- depends: [TC-010]
```

**Rules:**
- Always make `auth` tests depend on nothing (they are foundational)
- Dashboard/feature tests should depend on login (TC-001 or equivalent)
- Export/reporting tests should depend on the page they export from
- Never create circular dependencies

## Suite Ordering

Suites are displayed in this order (foundational first):

1. `auth` - Authentication (login, logout, password reset)
2. `user-management` - User profiles, roles, permissions
3. `dashboard` - Main dashboard and navigation
4. `data-entry` - Forms, CRUD operations
5. `reporting` - Reports, charts, analytics
6. `export` - PDF, CSV, print functionality
7. `admin` - Administration, settings
8. `integration` - Third-party integrations, APIs

## How to Analyze an Application

When generating test cases for an application:

1. **Identify the authentication flow** - This is always suite `auth`, always tested first
2. **Map the main navigation** - Each major section becomes a suite
3. **For each page/feature:**
   - What can the user do? (view, create, edit, delete, filter, search)
   - What are the edge cases? (empty state, max length, special characters)
   - What are the error cases? (invalid input, network failure, permission denied)
4. **Establish dependencies** - What must work before this feature can be tested?
5. **Assign priorities:**
   - `critical` - App is unusable without this (login, main navigation)
   - `high` - Core feature that most users need daily
   - `medium` - Important but not blocking other work
   - `low` - Nice-to-have, edge cases, cosmetic

## Example: Generating Tests for a Patient Management App

```json
[
  {
    "id": "TC-001",
    "title": "Login with valid credentials",
    "suite": "auth",
    "priority": "critical",
    "labels": ["smoke"],
    "depends": [],
    "objective": "Verify that staff can log into the system.",
    "prerequisites": ["Staff account exists in directory"],
    "steps": [
      "Navigate to /login",
      "Enter valid staff email",
      "Enter correct password",
      "Click Sign In"
    ],
    "expectedResult": "User sees the Patient Dashboard with their name in the header."
  },
  {
    "id": "TC-002",
    "title": "Login fails with invalid password",
    "suite": "auth",
    "priority": "high",
    "labels": ["negative"],
    "depends": [],
    "objective": "Verify that incorrect passwords are rejected.",
    "steps": [
      "Navigate to /login",
      "Enter valid email",
      "Enter incorrect password",
      "Click Sign In"
    ],
    "expectedResult": "Error message appears: 'Invalid credentials'. User stays on login page."
  },
  {
    "id": "TC-010",
    "title": "Dashboard shows patient summary",
    "suite": "dashboard",
    "priority": "critical",
    "labels": ["smoke"],
    "depends": ["TC-001"],
    "objective": "Verify the dashboard displays correct patient metrics.",
    "prerequisites": ["Logged in as staff"],
    "steps": [
      "Navigate to /dashboard",
      "Observe Total Patients count",
      "Observe Active Admissions count",
      "Verify Recent Patients table has data"
    ],
    "expectedResult": "All metrics display non-zero values. Recent patients table shows at least one row."
  }
]
```

## File Structure

When generating markdown files directly:

```
.traklet/test-cases/
  auth/
    TC-001-login-valid.md
    TC-002-login-invalid.md
    TC-003-logout.md
  dashboard/
    TC-010-dashboard-loads.md
    TC-011-dashboard-realtime.md
  export/
    TC-020-export-pdf.md
```

**Naming convention:** `TC-NNN-kebab-case-description.md`

## After Generation

```bash
# Validate test cases (check for missing deps, duplicate IDs)
npx traklet validate

# Push to Azure DevOps / GitHub
npx traklet sync

# The Traklet widget will show these test cases grouped by suite
# with dependency-aware blocking when testers run them
```
