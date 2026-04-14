---
name: gh-cloud-onboarding
description: Specialized logic for taking a local Antigravity project and deploying it as a 24/7 GitHub Action service with secrets. Use when requested to "deploy to cloud" or "add secrets".
---
# GitHub Cloud Onboarding Workflow

### 1. Repository Initialization
- Initialize git: `git init`
- Create `.gitignore` (EXCLUDE: `.env`, `*.json`, `node_modules`).
- **CRITICAL**: Ensure data files (e.g. `cases.csv`) are NOT ignored if the bot needs to push updates.

### 2. GitHub CLI Automation
- Create repo: `gh repo create <name> --private --source=. --remote=origin --push`
- Set Secrets:
  - `gh secret set <NAME> --body "<VALUE>"`
  - For JSON files: `gh secret set <NAME> < <file>`

### 3. Workflow Activation
- Check `.github/workflows/*.yml` for the correct `cron` schedule.
- Trigger manual test: `gh workflow run <filename>.yml`
- Monitor run: `gh run list --workflow="<filename>.yml"`

### 4. Local Environment
- Store the `SPREADSHEET_ID` in the local `.env` for parity.
