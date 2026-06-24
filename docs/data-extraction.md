# PDF Data Extraction

This document describes how data is extracted from the signed contract PDF
and mapped to the structured payload the main workflow operates on.

## The Problem

When a signed PDF arrives in Slack, n8n receives a Slack event with a file
attachment — not the parsed data. The workflow needs structured fields
(client name, milestones, finish materials) before it can create folders,
estimates, or spreadsheet rows. Getting from a PDF file to those fields
is the data extraction step.

## Where It Happens in the Workflow

```
Slack event (file) → [Data Extraction] → structured payload → main workflow steps
```

Data extraction happens as the first processing step, before the audit run
and before any external service is called. If extraction fails, the workflow
stops and notifies the operator.

## Fields Extracted

### Client & Project (Page 1 of contract)

| Field | Source in PDF | Maps To |
|---|---|---|
| `client_name` | Client name header | Drive folder, QB project, welcome email |
| `client_address` | Client address block | Drive folder name, QB project |
| `client_email` | Client email | Welcome email recipient |
| `client_phone` | Client phone | QB project contact |
| `project_type` | Proposal title (table header) | Drive folder name, QB project name |

### Milestones (Payment schedule table)

Each row in the Milestones table (excluding the discount line) becomes
one line item in the QuickBooks estimate and maps as:

| PDF Column | Field | Used In |
|---|---|---|
| Milestone name | `name` | QB estimate line item description |
| Amount | `amount` | QB estimate line item amount |

> The **Deposit** row amount is also used as the deposit invoice amount.

### Finish Materials (Finish material estimation table)

Each row in the finish materials table maps as:

| PDF Column | Field | Used In |
|---|---|---|
| Material | `material` | Finish Material Sheet — column A |
| Measure | `measure` | Finish Material Sheet — column B |
| Quantity | `qty` | Finish Material Sheet — column C |
| Unit Price | `unit_price` | Finish Material Sheet — column D |
| Approx. Cost | `approx_cost` | Finish Material Sheet — column E |

## Implementation Approach

Because the contract always follows the same template (fixed table positions,
consistent headers), extraction can be done with structured text parsing
rather than AI inference.

### Recommended n8n Implementation

```
1. HTTP Request node
   → Download PDF binary from Slack file URL
   → Requires Slack bot token in Authorization header

2. Code node (JavaScript)
   → Use pdf-parse or pdfjs-dist to extract raw text
   → Apply regex / string matching against known table headers
   → Output structured JSON matching the payload schema below

3. Set node
   → Validate required fields are present
   → Throw error if client_name, project_type, or milestones are missing
```

### Alternative: External PDF Extraction API

If in-workflow parsing is too brittle, send the PDF binary to an external
service (e.g., PDF.co, Extracta.ai) via HTTP Request and receive structured
JSON back. More robust but adds an external dependency.

### Out of Scope for MVP

Full AI-based contract interpretation (handling non-standard layouts,
free-form text, or contracts from other companies) is out of scope.
The extraction logic is intentionally coupled to this specific proposal
template.

## Output Payload Schema

The extraction step produces the following structure, which becomes
the working payload for all downstream workflow steps:

```json
{
  "slack_event_id": "string",
  "channel": "string",
  "received_at": "ISO 8601 datetime",
  "file": {
    "name": "string",
    "mimetype": "application/pdf",
    "url_private": "string"
  },
  "extracted": {
    "client_name": "string",
    "client_address": "string",
    "client_email": "string",
    "client_phone": "string",
    "project_type": "string",
    "milestones": [
      { "name": "string", "amount": "number" }
    ],
    "finish_materials": [
      {
        "material": "string",
        "measure": "string",
        "qty": "number",
        "unit_price": "number",
        "approx_cost": "number"
      }
    ]
  }
}
```

See `examples/sample-input.json` for a fully populated example,
and `examples/sample-contract.pdf` for the corresponding source document.
