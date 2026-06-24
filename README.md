# New Project Onboarding Automation

## Problem

When a signed contract arrives, a project manager must manually complete
a checklist across five different tools: Google Drive, QuickBooks,
Google Sheets, Gmail, and a PM tracking sheet. Each step is repetitive
and time-consuming, and none of it requires human judgment — making it
a strong candidate for automation.

## MVP Scope

Triggered when a signed PDF contract is posted to a Slack channel,
the workflow:

- detects the signed contract in the Slack channel;
- prevents duplicate processing using `event_id`;
- creates an audit run;
- creates a project folder in Google Drive;
- uploads the signed contract PDF to the project folder;
- creates a project and estimate in QuickBooks;
- creates a finish material sheet in Google Sheets;
- sends a welcome email to the client;
- updates the PM tracking sheet in Google Sheets;
- sends a deposit invoice via QuickBooks;
- records step results and failures in the audit log.

## Out of Scope

- AI reasoning or contract interpretation;
- automatic business decisions;
- production authentication;
- modifications to existing QuickBooks records;
- production cloud deployment.

## Stack

| Layer | Tool |
|---|---|
| Trigger | Slack (signed PDF in channel) |
| Workflow orchestration | n8n |
| Project workspace | Google Drive |
| Project & financials | QuickBooks |
| Tracking & materials | Google Sheets |
| Client communication | Gmail |
| Audit logging | Reusable n8n sub-workflows |

## Repository Structure

```
project-onboarding-automation/
├── README.md
├── docs/
│   ├── architecture.md      # System diagram and component ownership
│   ├── infrastructure.md    # Existing tools structure and field mapping
│   └── data-extraction.md   # How PDF data is extracted and mapped
├── examples/
│   ├── sample-contract.pdf  # Synthetic signed contract (workflow input)
│   ├── sample-input.json    # Parsed Slack trigger payload
│   └── sample-output.json   # Expected workflow result
├── workflows/               # n8n workflow exports (added after build)
├── screenshots/             # n8n canvas screenshots
├── .gitignore
└── LICENSE
```

## Usage

Workflows will be exported and added to `workflows/` after the n8n build
is complete. See `docs/architecture.md` for the system design.
