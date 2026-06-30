// ─── Code: Extract PDF Data ───────────────────────────────────────────────────
// Paste this entire block into the n8n Code node (Run once for all items mode).
//
// Input:  binary item with key "data" — PDF file from Slack trigger
// Output: single item with all extracted fields
//
// Tested on:
//   • examples/sample-contract.pdf   (Sunroom Conversion, 7 milestones, 8 materials)
//   • Proposal - Sam Gale (real PDF) (Bathroom Remodel, 6 milestones, 6 materials)
// ─────────────────────────────────────────────────────────────────────────────

const pdfParse = require('pdf-parse');
const pdfBuffer = await $helpers.getBinaryDataBuffer($input.first(), 'data');
const parsed   = await pdfParse(pdfBuffer);

const lines = parsed.text
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);

// ── helpers ───────────────────────────────────────────────────────────────────
const KNOWN_UNITS = /^(Set|Each|Sq\.?\s*Ft\.?|Gallon|Gallons|Linear\s*Ft|LF|SF|SY|Pair|Roll|Box|Bag|Sheet)$/i;
const IS_DECIMAL  = /^\d+\.?\d*$/;
const IS_PRICE    = /^\$[\d,]+(?:\.\d{1,2})?$/;
const IS_DATE     = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}$/i;
const IS_PAGE     = /^Page\s+\d+\s+of\s+\d+$/i;
const IS_EMAIL    = /[\w.+\-]+@[\w.\-]+\.[a-z]{2,}/i;
const MS_END      = /^(?:TERMS|Agreed|PLEASE\s+FEEL|Page\s+\d)/i;

const toNum = s => parseFloat(s.replace(/[$,]/g, ''));

// ── client info ───────────────────────────────────────────────────────────────
// PDF page 1 structure (both sample and real PDFs):
//   [company name / address / phone / email / contact name]
//   Date              ← dateIdx
//   Client name       ← +1
//   Client address    ← +2
//   Client phone      ← +3
//   Client email      ← +4

const dateIdx = lines.findIndex(l => IS_DATE.test(l));
if (dateIdx < 0) throw new Error('Could not find date line — PDF structure unrecognized.');

const clientName    = lines[dateIdx + 1] ?? null;
const clientAddress = lines[dateIdx + 2] ?? null;
const clientPhone   = lines[dateIdx + 3] ?? null;
const clientEmail   = (lines[dateIdx + 4] ?? '').match(IS_EMAIL)?.[0] ?? null;

// ── project type ──────────────────────────────────────────────────────────────
// After client email: "ClientName - Address - ProjectType"
// Line may wrap (pdf-parse can break long lines mid-segment).
// Fix: try header line alone first. If last " - " segment is a single word
// (wrapped), join with the next line.

// emailLineIdx is always dateIdx+4 — that's where clientEmail was extracted from.
const emailLineIdx = dateIdx + 4;

let projectType = null;
{
  const headerLine = lines[emailLineIdx + 1] ?? '';
  const parts      = headerLine.split(' - ');
  if (parts.length >= 3) {
    let pt = parts[parts.length - 1].trim();
    if (!pt.includes(' ')) {          // single word → likely wrapped
      const nextLine = lines[emailLineIdx + 2] ?? '';
      if (!nextLine.includes(' - ')) pt = (pt + ' ' + nextLine).trim();
    }
    projectType = pt || null;
  }
}

// ── milestones ────────────────────────────────────────────────────────────────
// The table extracts left column first, but behaviour varies by row height:
//   • When all rows fit one Y-band:  all names → "Amount" → all amounts
//   • When rows span different bands: first N names → "Amount" → then
//     remaining rows interleave name, $amount, name, $amount, …
//
// Robust approach:
//   1. Collect names found BEFORE "Amount" (left-column pass)
//   2. Collect any additional names found AFTER "Amount" (interleaved pass)
//   3. All $ amounts after "Amount" (in order, limited to total name count)

const msHeaderIdx = lines.findIndex(l => /^Milestone$/i.test(l));
const msAmountIdx = lines.findIndex((l, i) => i > msHeaderIdx && /^Amount$/i.test(l));
if (msHeaderIdx < 0 || msAmountIdx < 0) throw new Error('Could not find Payment Milestones table.');

const msEndIdx = lines.findIndex((l, i) => i > msAmountIdx && MS_END.test(l));
const afterAmt = lines.slice(msAmountIdx + 1, msEndIdx >= 0 ? msEndIdx : undefined);

const msNamesLeft  = lines.slice(msHeaderIdx + 1, msAmountIdx)
  .filter(l => !/^Total$/i.test(l) && !/^Note:/i.test(l) && !IS_PAGE.test(l));

const msNamesRight = afterAmt
  .filter(l => !IS_PRICE.test(l) && !IS_PAGE.test(l) && !IS_DECIMAL.test(l)
            && !/^Total$/i.test(l) && !/^Note:/i.test(l));

const allMsNames   = [...msNamesLeft, ...msNamesRight];
const allMsAmounts = afterAmt.filter(l => IS_PRICE.test(l)).map(toNum);

const milestones = allMsNames.map((name, i) => ({
  name,
  amount: allMsAmounts[i] ?? 0,
}));

if (milestones.length === 0) throw new Error('Milestones table parsed 0 rows.');

// ── finish materials ──────────────────────────────────────────────────────────
// The 5-column table extracts left column (material names) first, then right
// columns (measure, qty, unit price, approx cost). Because rows have different
// heights, the right-column data may appear as:
//   • (unit, approx) pairs per row  — for rows sharing the same Y-band
//   • all units then all approx     — for rows in their own Y-bands
//
// Strategy: greedy pair mode. For each item try (prices[j], prices[j+1]) as
// (unit, approx). Validate: round(unit × qty) ≈ approx (±2% or ±$0.50).
// On first mismatch (or prices exhausted), switch to column mode for remaining items.

const fmCostHeaderIdx  = lines.findIndex(l => /^Approx\.?\s*Cost$/i.test(l));
const fmApproxTotalIdx = lines.findIndex((l, i) => i > fmCostHeaderIdx && /^Approx\s*Total$/i.test(l));

const materials = [];

if (fmCostHeaderIdx >= 0 && fmApproxTotalIdx >= 0) {

  // 1. Group wrapped name lines into one name per material row.
  //    A new material starts when the line begins with an uppercase letter
  //    and is NOT a parenthetical continuation (does not start with "(").
  const rawNames = lines
    .slice(fmCostHeaderIdx + 1, fmApproxTotalIdx)
    .filter(l => !KNOWN_UNITS.test(l) && !IS_DECIMAL.test(l)
              && !IS_PRICE.test(l) && !IS_PAGE.test(l));

  const groupedNames = [];
  for (const line of rawNames) {
    const isNewItem = /^[A-Z]/.test(line) && !line.startsWith('(');
    if (groupedNames.length === 0 || isNewItem) {
      groupedNames.push(line);
    } else {
      groupedNames[groupedNames.length - 1] += ' ' + line;
    }
  }

  const N = groupedNames.length;

  // 2. Collect right-column data from after "Approx Total" to end of section.
  //    No reliable end-marker exists here — slice to end of lines array.
  const afterTotal = lines.slice(fmApproxTotalIdx + 1);

  const measures   = afterTotal.filter(l => KNOWN_UNITS.test(l));
  const quantities = afterTotal.filter(l => IS_DECIMAL.test(l)).map(toNum);
  const allPrices  = afterTotal.filter(l => IS_PRICE.test(l)).map(toNum);

  // Remove the Approx Total sum itself (appears when count = 2N + 1)
  const prices = allPrices.length === 2 * N + 1
    ? allPrices.slice(0, -1)
    : allPrices.slice(0, 2 * N);

  // 3. Pair/column split
  const unitPrices  = new Array(N).fill(0);
  const approxCosts = new Array(N).fill(0);
  let j = 0, i = 0;

  while (i < N) {
    // Fall into column mode when prices are exhausted mid-pair-scan
    if (j + 1 >= prices.length) {
      const remaining = prices.slice(j);
      const rem       = N - i;
      for (let k = 0; k < rem; k++) {
        unitPrices[i + k]  = remaining[k]       ?? 0;
        approxCosts[i + k] = remaining[rem + k] ?? 0;
      }
      break;
    }

    const u = prices[j], a = prices[j + 1];
    const q = quantities[i] ?? 1;
    const tol = Math.max(a * 0.02, 0.50);
    const pairValid = Math.abs(Math.round(u * q * 100) / 100 - a) <= tol;

    if (pairValid) {
      unitPrices[i]  = u;
      approxCosts[i] = a;
      j += 2; i++;
    } else {
      // Column mode for remaining items
      const remaining = prices.slice(j);
      const rem       = N - i;
      for (let k = 0; k < rem; k++) {
        unitPrices[i + k]  = remaining[k]       ?? 0;
        approxCosts[i + k] = remaining[rem + k] ?? 0;
      }
      break;
    }
  }

  for (let idx = 0; idx < N; idx++) {
    materials.push({
      material:    groupedNames[idx],
      measure:     measures[idx]    ?? '',
      qty:         quantities[idx]  ?? 0,
      unit_price:  unitPrices[idx],
      approx_cost: approxCosts[idx],
    });
  }
}

// ── validation ────────────────────────────────────────────────────────────────
if (!clientName)             throw new Error('client_name not found.');
if (!clientEmail)            throw new Error('client_email not found.');
if (!projectType)            throw new Error('project_type not found.');
if (milestones.length === 0) throw new Error('No milestones parsed.');

// ── output ────────────────────────────────────────────────────────────────────
return [{
  json: {
    slack_event_id:   $('Slack: File Shared').item.json.event?.event_ts   ?? '',
    slack_file_id:    $('Slack: File Shared').item.json.event?.file_id    ?? '',
    slack_file_url:   $('Slack: File Shared').item.json.file?.url_private ?? '',
    slack_file_name:  $('Slack: File Shared').item.json.file?.name        ?? '',
    received_at:      $now.toISO(),
    client_name:      clientName,
    client_email:     clientEmail,
    client_phone:     clientPhone,
    client_address:   clientAddress,
    project_type:     projectType,
    milestones,
    finish_materials: materials,
  },
}];
