# Project Rules: TutorCircle Auto Apply (#tutorcircle)

# GSheet Persistence (#gsheet-persistence)
**Rule**: Before attempting to synchronize data or create a spreadsheet, the agent MUST check for an existing `SPREADSHEET_ID` in the `.env` or project config.
**Goal**: Prevent redundant resource creation and ensure data continuity.
**Negative Test Case**: If the agent creates a new spreadsheet when a `.env` file with `SPREADSHEET_ID` already exists, output: "🛑 Violation: SPREADSHEET_ID already exists. Use the existing sheet."

# Bot Evasion Strategy (#scaper-bot-evasion)
**Rule**: All scraping operations MUST be sequential (for..of loops) with a minimum 500ms delay between case interactions.
**Goal**: Prevent IP blocking and account flagging by mimic-ing human browsing speed.
**Negative Test Case**: If the agent suggests using `Promise.all()` for case expansion, output: "🛑 Violation: Sequential processing required for bot evasion."

# Bot Data Tracking (#bot-data-tracking)
**Rule**: Any data file that needs to be updated and pushed by a GitHub Action (e.g., `cases.csv`) MUST NOT be included in the `.gitignore`.
**Goal**: Prevent "invisible" failures in the cloud-sync pipeline.
**Negative Test Case**: If the agent includes an auto-updated data file in `.gitignore`, output: "🛑 Violation: Data files for bot-updates must remain tracked."

# Local NPM Workaround (#local-npm-fix)
**Rule**: On this environment, the standard `npm` wrapper is broken. ALWAYS use the direct Node call: `PATH=$PATH:/usr/local/bin node /usr/local/lib/node_modules/npm/bin/npm-cli.js`.
**Goal**: Ensure dependency installation succeeds without manual troubleshooting.
**Negative Test Case**: If the agent runs `npm install` without the direct Node path, output: "🛑 Violation: Use the direct npm-cli.js path for this environment."
