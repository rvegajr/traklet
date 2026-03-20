---
adapter: azure-devops
baseUrl: https://dev.azure.com/sjiorg
project: sji-flight-deck-pro
tokenEnv: ADO_PAT
---

# Traklet Configuration

This file configures how `npx traklet sync` discovers and syncs
test cases to the backend.

## Token

Set the `ADO_PAT` environment variable with your Azure DevOps
Personal Access Token, or log in via `az login` and the CLI
will acquire a token automatically.

## Adding Test Cases

Create markdown files in `test-cases/` with YAML frontmatter:

```yaml
---
id: TC-XXX
title: "What this test verifies"
priority: medium
labels: [test-case, feature-area]
depends: [TC-001]  # optional prerequisites
suite: auth        # optional grouping
---
```

Then run `npx traklet sync` to push them to Azure DevOps.
