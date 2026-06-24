# Architecture

## System Diagram

```mermaid
flowchart TD
    A([Slack: signed PDF contract\narrives in channel]) --> B[Extract project data\nfrom message / PDF]
    B --> C{Duplicate check\nevent_id}
    C -- duplicate --> Z([Skip — already processed])
    C -- new --> D[SYS — Audit Run Create]
    D --> E[Google Drive\nCreate project folder]
    E --> F[QuickBooks\nCreate project + estimate]
    F --> G[Google Sheets\nCreate finish material sheet]
    G --> H[Gmail\nSend welcome email]
    H --> I[Google Sheets\nUpdate PM tracking sheet]
    I --> J[QuickBooks\nSend deposit invoice]
    J --> K[SYS — Audit Append Event]
    K --> L[SYS — Audit Update Run]
    L --> M([COMPLETED])

    E -- error --> ERR[Error handler\nNotify operator in Slack]
    F -- error --> ERR
    G -- error --> ERR
    H -- error --> ERR
    I -- error --> ERR
    J -- error --> ERR
    ERR --> K
```

## Component Ownership

| Component | Responsibility |
|---|---|
| Slack | Trigger — receives signed PDF contract |
| n8n main workflow | End-to-end onboarding orchestration |
| Audit sub-workflows | Run and event logging |
| Google Drive | Project folder / workspace |
| QuickBooks | Project record, estimate, deposit invoice |
| Google Sheets (materials) | Finish material sheet |
| Gmail | Welcome email to client |
| Google Sheets (PM) | PM tracking sheet update |
| Error handler | Notifies operator on any step failure |
| Human operator | Manual review and retry of failed steps |

## Reusable Sub-Workflows

| Sub-workflow | Purpose |
|---|---|
| SYS — Audit Run Create | Opens a new audit run record |
| SYS — Audit Append Event | Logs an individual step result or failure |
| SYS — Audit Update Run | Closes the run with final status |
