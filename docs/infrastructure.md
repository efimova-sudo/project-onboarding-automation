# Infrastructure Reference

This document describes the existing infrastructure that the onboarding
workflow reads from and writes to.

---

## Google Drive — Projects Folder

### Project Folder Naming Convention

```
[Client First Name + Last Name] | [Street Address, City, State ZIP] | [Project Type]
```

**Examples (synthetic):**

- `Sarah Mitchell | 3247 W Oakridge Blvd, Salt Lake City, UT 84104 | Bathroom Remodel`
- `James Porter | 6182 Maple Creek Dr, Sandy, UT 84070 | Kitchen Remodel`
- `Maria Chen | 1534 Blue Heron Way, Salt Lake City, UT 84108 | Full Home Remodel`

**Rules:**
- Always include full client name (first + last)
- Always include the full project address
- Always include the project type
- Use the pipe symbol ( | ) to separate sections

### Standard Subfolder Structure

Every project folder contains the following subfolders, created at onboarding:

| Subfolder | Contents |
|---|---|
| Contract & Change Orders | Signed contracts, amendments, change orders |
| Finish Material | Approved finish selections and material specifications |
| Inspirations | Client-provided references, design ideas, mood boards |
| Invoices | Client invoices, subcontractor bills, payment receipts |
| Plans & Reports | Architectural drawings, engineering reports, permits |
| Media | Photos, videos, walkthroughs, marketing assets |

### File Naming Convention

```
[Client First Name + Last Name] – [Project Type] – [Document Type]
```

**Examples (synthetic):**

- `Sarah Mitchell – Bathroom Remodel – Contract`
- `James Porter – Kitchen Remodel – Invoice #2`
- `Maria Chen – Full Home Remodel – Site Photos`

**Rules:**
- Do not add dates — Google Drive tracks created/modified dates automatically
- Always use the client's full name
- For multiple versions, append `v2`, `v3`, etc.

---

## PM Google Sheet — Dashboard Tab

The PM Dashboard is the central project tracking sheet. Each row is one project.
The workflow appends a new row when onboarding completes.

See `examples/sample-pm-sheet-template.xlsx` for the column structure.

### Columns Written by This Workflow

| Column | Value Written | Source |
|---|---|---|
| Customer Name | `client_name` | Extracted from PDF |
| Project Type | `project_type` | Extracted from PDF |
| City Name (permit) | City portion of `client_address` | Extracted from PDF |
| Estimate Number | QB estimate number | QuickBooks (previous step) |
| Signed Contract | `TRUE` | Set by workflow on trigger |
| Project Stage | `"Onboarding"` | Set by workflow as initial stage |
| Total Contract Value | Sum of all milestone amounts | Calculated from PDF milestones |

---

## Contract PDF — Structure & Data Mapping

The signed proposal PDF is the primary input to the workflow. It arrives
as a Slack file attachment. The workflow extracts the following data:

### Client & Project Header (Page 1)

| PDF Field | Extracted As | Used In |
|---|---|---|
| Client full name | `client_name` | Drive folder name, QB project, welcome email |
| Client address | `client_address` | Drive folder name, QB project |
| Client email | `client_email` | Welcome email recipient |
| Project type (table header) | `project_type` | Drive folder name, QB project name |

### Finish Material Estimation Table (Page 3)

Columns extracted per row:

| Column | Field | Used In |
|---|---|---|
| Material | `material` | Finish Material Sheet |
| Measure | `measure` | Finish Material Sheet |
| Quantity | `qty` | Finish Material Sheet |
| Unit Price | `unit_price` | Finish Material Sheet |
| Approx. Cost | `approx_cost` | Finish Material Sheet |

### Milestones Table (Page 4)

Columns extracted per row (discount line excluded):

| Column | Field | Used In |
|---|---|---|
| Milestone name | `name` | QuickBooks estimate line item |
| Amount | `amount` | QuickBooks estimate line item amount |

> Deposit milestone → also used as the deposit invoice amount.

### Pages Excluded from Processing

| Pages | Content | Reason |
|---|---|---|
| 7 | Contractor license | Internal company document, not used by workflow |
| 8 | Certificate of insurance | Internal company document, not used by workflow |

---

## Finish Material Sheet

One sheet per project. Created by the workflow and saved to the project's
`Finish Material` subfolder in Google Drive.

**File name:** `[Client Name] – [Project Type] – Finish Material List`
(e.g. `Alex Morgan – Sunroom Conversion – Finish Material List`)

See `examples/sample-finish-material-template.xlsx` for the column structure.

### Columns Written by This Workflow

| Column | Value Written | Source |
|---|---|---|
| Material | `material` | Extracted from PDF finish materials table |
| Unit | `measure` | Extracted from PDF |
| Supplied By | `"By Client"` | All PDF items are client-supplied |
| Unit Price | `unit_price` | Extracted from PDF |
| Quantity | `qty` | Extracted from PDF |
| Total Price | `=Quantity * Unit Price` | Formula (auto-calculated) |

### Totals (Auto-Calculated by Formulas)

| Row | Formula |
|---|---|
| Total — By Client | `SUMIF(Supplied By = "By Client", Total Price)` |
| Total — By Company | `SUMIF(Supplied By = "By Company", Total Price)` |

### Columns Left for PM to Fill Manually

Date Ordered, Specs / Model, Purchase Link, Ordered?, Status, Notes.

---

## QuickBooks

The workflow creates two linked objects in QuickBooks: a **Project** (with a new Customer)
and a **Project Estimate** (with line items from the contract milestones).
After the estimate is saved, a **Deposit Invoice** is sent for the first milestone.

### 1. Project + Customer

**Project naming convention:**

```
[Client Name] - [Project Type]
```

Example: `Alex Morgan - Sunroom Conversion`

**Fields written by workflow:**

| QB Field | Value | Source |
|---|---|---|
| Project name | `"{client_name} - {project_type}"` | Extracted from PDF |
| Customer first name | First word of `client_name` | Extracted from PDF |
| Customer last name | Remaining words of `client_name` | Extracted from PDF |
| Customer email | `client_email` | Extracted from PDF |
| Customer phone | `client_phone` | Extracted from PDF |
| Billing address — street | Street portion of `client_address` | Extracted from PDF |
| Billing address — city | City portion of `client_address` | Extracted from PDF |
| Billing address — state | State portion of `client_address` | Extracted from PDF |
| Billing address — ZIP | ZIP portion of `client_address` | Extracted from PDF |
| Start date | `received_at` (contract signing date) | Slack event |
| Status | `"In progress"` | Set by workflow |

**Fields left for manual completion:**

Project Manager, Office Manager, Sales Representative (assigned at project kickoff).

---

### 2. Project Estimate

Set on the estimate: `estimate_date` = contract signing date (`received_at`).

Each milestone from the PDF becomes one line item:

| QB Field | Value | Source |
|---|---|---|
| Description | `milestone.name` | PDF milestones table |
| Customer rate | `milestone.amount` | PDF milestones table |
| Qty | `1` | Fixed |
| Billable | `true` | Fixed |

---

### 3. Deposit Invoice

Sent immediately after the estimate is saved.

| QB Field | Value | Source |
|---|---|---|
| Product / Service | `"Deposit"` | First milestone name |
| Customer rate | Amount of the Deposit milestone | PDF milestones table |
| Qty | `1` | Fixed |
| Customer | Linked to project customer | Created in step 1 |

---

## Audit Logging — Google Sheets

Audit logs are written by `SYS - Audit Service` to a dedicated Google Sheets file (`TEST_Automation_Logs` in development; a production equivalent in prod). The file has two tabs.

### Tab: automation_runs

One row per workflow execution. Written at start (`CREATE_RUN`) and updated at finish (`UPDATE_RUN`).

| Column | Description |
|---|---|
| `run_id` | Unique run identifier — `RUN-{event_ts}` |
| `execution_id` | n8n execution ID |
| `workflow_id` | n8n workflow ID |
| `workflow_name` | Human-readable workflow name |
| `workflow_version` | Semver string (e.g. `1.0.0`) |
| `environment` | `TEST`, `STAGING`, or `PROD` |
| `correlation_id` | Slack `event_ts` — ties all audit records for one contract |
| `entity_type` | Always `PROJECT` for this system |
| `entity_id` | Slack `event_ts` |
| `source_type` | `SLACK_FILE_SHARED` |
| `source_event_id` | Slack `event_ts` — used as deduplication key |
| `started_at` | ISO datetime when the run opened |
| `finished_at` | ISO datetime when the run closed (empty while running) |
| `status` | `RUNNING` → `SUCCESS` / `FAILED` / `PARTIAL_FAILURE` etc. |
| `last_completed_step` | Last step confirmed complete (e.g. `DEPOSIT_INVOICE_SENT`) |
| `failed_step` | Step that failed (empty on success) |
| `error_type` | Error category code (empty on success) |
| `error_code` | Structured error code (empty on success) |
| `error_summary` | Human-readable error description (empty on success) |
| `retry_count` | Number of retries (0 for first attempt) |
| `execution_url` | Direct link to the n8n execution (optional) |

### Tab: automation_events

One row per discrete step within a run. Written via `APPEND_EVENT`.

| Column | Description |
|---|---|
| `event_id` | Unique event identifier |
| `run_id` | Parent run — foreign key to `automation_runs.run_id` |
| `correlation_id` | Same as parent run |
| `occurred_at` | ISO datetime of the event |
| `step` | Step name (e.g. `PROJECT_FOLDER_CREATED`) |
| `service` | External service involved (e.g. `GOOGLE_DRIVE`) |
| `action` | Action performed (e.g. `CREATE_FOLDER`) |
| `status` | `STARTED`, `SUCCESS`, `FAILED`, or `SKIPPED` |
| `resource_type` | Type of resource created/modified (optional) |
| `resource_id` | ID of the resource (optional) |
| `resource_url` | URL of the resource (optional) |
| `duration_ms` | Time taken in milliseconds (optional) |
| `message` | Human-readable description (optional) |
| `metadata_json` | JSON blob of additional context (optional) |
