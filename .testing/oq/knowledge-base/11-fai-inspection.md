# Feature: First Article Inspection (FAI)

## What It Does

First Article Inspection (FAI) per AS9102 Rev C is a formal verification that a production process can produce parts meeting all engineering requirements. It is a structured, documented process that proves -- before full production begins -- that the manufacturing process, tooling, and inspection methods are capable of producing conforming product.

FAI is mandatory for aerospace (AS9100 / AS9102), widely used in automotive (IATF 16949), defense (MIL-STD), and medical devices (ISO 13485). Cassini implements the full AS9102 Rev C standard with Forms 1, 2, and 3, a draft-submitted-approved workflow, and separation of duties enforcement.

---

## Where To Find It

| Location | Route | Min Role | Description |
|---|---|---|---|
| FAI report list | `/fai` | supervisor (view) / engineer (create) | Table of all FAI reports for the selected plant |
| FAI report editor | `/fai/{reportId}` | supervisor (view) / engineer (edit) | Form 1/2/3 tabs, workflow actions, print view |

Creating and editing reports requires **engineer+** role. Viewing reports and form data requires **supervisor+**. The FAI page link appears in the sidebar under "Studies" for engineer+ roles.

---

## Key Concepts (Six Sigma Context)

### AS9102 Rev C Form Structure

AS9102 defines three forms that together document complete part accountability:

#### Form 1 -- Part Number Accountability
Establishes WHAT is being inspected:
- Part number, part name, and revision
- Serial number and/or lot number
- Drawing number
- Organization name and supplier
- Purchase order reference
- Reason for inspection (new part, engineering change, process change, supplier change, etc.)
- Submission and approval timestamps

#### Form 2 -- Product Accountability
Establishes the material and process chain:
- Raw material supplier and certification references
- Material specification (e.g., Al 6061-T6, Ti-6Al-4V)
- Special processes (heat treatment, surface treatment, plating, non-destructive testing, etc.)
- Functional test results
- Sub-assembly FAI references (if applicable)

#### Form 3 -- Characteristic Accountability
The measurement data -- the heart of the FAI:
- Each row represents one characteristic from the engineering drawing
- **Balloon number**: The numbered callout on the drawing
- **Characteristic name**: What is being measured (e.g., "Outer Diameter", "Length", "Surface Finish")
- **Nominal**: The target value from the drawing
- **USL / LSL**: Upper and lower specification limits (tolerance bounds)
- **Actual value**: The measured value from the first article
- **Unit**: Measurement unit (mm, in, Ra, etc.)
- **Tools used**: The gage or instrument used (e.g., "Mitutoyo 6\" caliper #M-042")
- **Result**: Pass, fail, or deviation (with reason for deviation)

### Workflow and Separation of Duties

The FAI report follows a strict lifecycle:

```
Draft --> Submitted --> Approved
                   \--> Rejected (returns to Draft)
```

- **Draft**: Report is being created and edited. All fields are editable. Only draft reports can be modified or deleted.
- **Submitted**: An engineer submits the report for approval. The report becomes non-editable. The `submitted_by` user ID is recorded.
- **Approved**: A different user (engineer+ role) approves the report. The `approved_by` user ID is recorded with timestamp.
- **Rejected**: A reviewer rejects the report with a mandatory reason. The report returns to draft status so corrections can be made.

**Separation of duties** is enforced server-side: the user who submits the report (submitted_by) CANNOT be the same user who approves it (approved_by). This prevents self-approval conflicts of interest and is a regulatory requirement in aerospace quality systems. The backend returns HTTP 403 if the same user attempts both actions.

### Full vs. Partial vs. Delta FAI

- **Full FAI**: Covers ALL characteristics on the engineering drawing. Required for initial production, new suppliers, or major process changes.
- **Partial FAI**: Covers a subset of characteristics. Used when only certain features are affected by a change.
- **Delta FAI**: Covers ONLY the characteristics changed by an engineering change order (ECO). References the previous full FAI for unchanged characteristics.

Cassini supports all three by allowing any number of Form 3 items to be added. The `reason_for_inspection` field documents which type applies.

### Electronic Signatures Integration

If an electronic signature workflow is configured for the `fai_report` resource type at the plant level, Cassini automatically initiates signature workflows on submission and approval actions. Prior signatures are invalidated when report content changes (via `invalidate_signatures_for_resource`). This supports 21 CFR Part 11 compliance requirements.

---

## How To Configure (Step-by-Step)

### Creating a New FAI Report

1. Log in as engineer or admin
2. Select the appropriate plant from the header plant switcher
3. Navigate to `/fai`
4. Click **New Report** -- the system creates a draft report with placeholder part number "NEW-PART" and redirects to the editor
5. The report editor opens on Form 1 tab

### Filling Form 1 (Part Number Accountability)

1. In the FAI Report Editor, ensure the "Form 1" tab is active
2. Enter part identification:
   - **Part Number**: The engineering part number (e.g., "OQ-PART-001")
   - **Part Name**: Descriptive name (e.g., "Test Widget Bracket")
   - **Revision**: Drawing revision (e.g., "A", "B", "C")
   - **Serial Number**: Individual part serial (if applicable)
   - **Lot Number**: Production lot identifier (if applicable)
   - **Drawing Number**: Engineering drawing reference
3. Enter organization details:
   - **Organization Name**: Your company name
   - **Supplier**: If parts are from a supplier
   - **Purchase Order**: PO reference
4. Select **Reason for Inspection**: New part, engineering change, process change, etc.
5. Click Save

### Filling Form 2 (Product Accountability)

1. Switch to the "Form 2" tab
2. Enter material information:
   - **Material Supplier**: Raw material vendor
   - **Material Spec**: Material specification (e.g., "Al 6061-T6 per AMS 4027")
3. Enter process information:
   - **Special Processes**: Heat treatment, anodize, plating, etc. (stored as JSON)
   - **Functional Test Results**: Test outcomes (stored as JSON)
4. Click Save

### Adding Form 3 Items (Characteristics)

1. Switch to the "Form 3" tab
2. Click **Add Item** for each characteristic on the drawing
3. For each item, fill:
   - **Balloon Number**: Sequential drawing callout number
   - **Characteristic Name**: What is measured
   - **Nominal**: Target value
   - **USL**: Upper specification limit
   - **LSL**: Lower specification limit
   - **Actual Value**: Measured value from first article
   - **Unit**: mm, in, Ra, etc.
   - **Tools Used**: Gage identification (e.g., "Caliper #M-042")
   - **Result**: Pass, fail, or deviation
   - **Deviation Reason**: Required if result is "deviation"
4. Items can be linked to Cassini characteristics via `characteristic_id` for traceability

---

## How To Use (Typical Workflow)

### Complete FAI Lifecycle

1. **Engineer creates report**: Navigate to `/fai`, click New Report, fill Forms 1/2/3
2. **Engineer submits**: Click Submit. Status changes to "submitted". Report becomes read-only.
3. **Different user reviews**: A separate engineer or admin navigates to the report
4. **Reviewer approves or rejects**:
   - **Approve**: Status changes to "approved", report is locked permanently
   - **Reject with reason**: Status returns to "draft", rejection reason is displayed, engineer can make corrections and resubmit
5. **Print view**: Click the Print/Preview button to generate an AS9102-formatted document with all three forms

### Print View

The FAI Print View (`FAIPrintView.tsx`) renders the report in AS9102-compliant format:
- Header with AS9102 form identification
- Form 1: Part accountability table with all identification fields
- Form 2: Material and process accountability
- Form 3: Characteristic table with balloon numbers, requirements, actuals, and pass/fail
- Signature blocks with submitter/approver names and timestamps
- Can be printed directly or saved as PDF via browser print dialog

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Report creation | POST returns 201 with status "draft", part_number set |
| 2 | Form 1 data persists | PUT updates part_number, part_name, revision, serial_number, etc. GET returns updated values |
| 3 | Form 2 data persists | PUT updates material_supplier, material_spec, special_processes. GET returns updated values |
| 4 | Form 3 items added | POST returns item with balloon_number, nominal, usl, lsl, actual_value, result |
| 5 | Form 3 items updated | PUT updates characteristic fields. GET returns updated values |
| 6 | Form 3 items deleted | DELETE removes item. GET returns reduced item count |
| 7 | Submit workflow | POST changes status from "draft" to "submitted", sets submitted_by and submitted_at |
| 8 | Approve workflow | POST changes status from "submitted" to "approved", sets approved_by and approved_at |
| 9 | Reject workflow | POST changes status from "submitted" to "draft", sets rejection_reason |
| 10 | Separation of duties | POST approve by same user as submitter returns 403 |
| 11 | Draft-only editing | PUT/DELETE on non-draft report returns 409 |
| 12 | Print view renders | All 3 forms visible with data, proper headers, signature blocks |
| 13 | Report list filters | GET returns reports filtered by status (draft/submitted/approved/rejected) |
| 14 | Report deletion | Only draft reports can be deleted; non-draft returns 409 |

---

## Edge Cases & Constraints

- **Cannot approve own submission**: Server returns HTTP 403 "Separation of duties: the approver cannot be the same person who submitted the report" if `submitted_by == user.id`.
- **Cannot edit approved FAI**: Only draft reports can be modified. PUT/DELETE on submitted or approved reports returns HTTP 409.
- **Cannot delete non-draft FAI**: DELETE on submitted or approved reports returns HTTP 409.
- **Empty Form 3**: A report with zero inspection items can technically be submitted, but this is a quality concern -- the print view will show an empty Form 3 table.
- **Rejection clears previous rejection**: Resubmitting after rejection clears the old `rejection_reason`.
- **Report creation creates placeholder**: The UI creates a report with `part_number: "NEW-PART"` on New Report click, then navigates to the editor for completion. This means a "NEW-PART" entry briefly exists in the list.
- **Pass/fail auto-determination**: The `result` field (pass/fail/deviation) is set manually per item. Cassini does not auto-calculate pass/fail from nominal vs actual vs tolerance -- the inspector determines the result.
- **Deviation reason required**: If result is "deviation", the `deviation_reason` field should explain why the out-of-tolerance condition is acceptable (material review board disposition, etc.).
- **Signature workflows**: If e-signatures are configured for `fai_report`, submission and approval trigger workflow initiation. Content changes invalidate prior signatures.
- **Plant scoping**: All FAI reports are scoped to a plant. Users need supervisor+ role to view, engineer+ to create/edit.
- **Cascade delete**: Deleting a report cascades to all Form 3 items.

---

## API Reference (for seeding)

### Report Lifecycle
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/fai/reports` | JWT (engineer+) | Create new report in draft status |
| `GET` | `/fai/reports?plant_id=N` | JWT (supervisor+) | List reports for a plant (optional status filter) |
| `GET` | `/fai/reports/{id}` | JWT (supervisor+) | Get report with all items |
| `PUT` | `/fai/reports/{id}` | JWT (engineer+) | Update report header (draft only) |
| `DELETE` | `/fai/reports/{id}` | JWT (engineer+) | Delete report (draft only) |

### Form 3 Items
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/fai/reports/{id}/items` | JWT (engineer+) | Add inspection item |
| `PUT` | `/fai/reports/{id}/items/{item_id}` | JWT (engineer+) | Update inspection item |
| `DELETE` | `/fai/reports/{id}/items/{item_id}` | JWT (engineer+) | Remove inspection item |

### Workflow
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/fai/reports/{id}/submit` | JWT (engineer+) | Submit for approval (draft -> submitted) |
| `POST` | `/fai/reports/{id}/approve` | JWT (engineer+) | Approve (submitted -> approved, separation of duties enforced) |
| `POST` | `/fai/reports/{id}/reject` | JWT (engineer+) | Reject with reason (submitted -> draft) |

### Form Data Export
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/fai/reports/{id}/forms` | JWT (supervisor+) | Get structured AS9102 form data (Form 1/2/3) |

### Request Schemas (key fields)
```json
// FAIReportCreate (POST /fai/reports)
{
  "plant_id": 1,
  "part_number": "OQ-PART-001",
  "part_name": "Test Widget",
  "revision": "A",
  "serial_number": "SN-001",
  "lot_number": "LOT-2026-001",
  "drawing_number": "DWG-001",
  "organization_name": "Saturnis Manufacturing",
  "supplier": "Parts Corp",
  "purchase_order": "PO-12345",
  "reason_for_inspection": "new_part",
  "material_supplier": "Alcoa",
  "material_spec": "Al 6061-T6 per AMS 4027",
  "special_processes": "[\"anodize\", \"heat_treat\"]",
  "functional_test_results": "{\"leak_test\": \"pass\"}"
}

// FAIReportUpdate (PUT /fai/reports/{id})
{
  "part_number": "OQ-PART-001-REV-B",
  "revision": "B"
}

// FAIItemCreate (POST /fai/reports/{id}/items)
{
  "balloon_number": 1,
  "characteristic_name": "Outer Diameter",
  "nominal": 25.00,
  "usl": 25.05,
  "lsl": 24.95,
  "actual_value": 25.01,
  "unit": "mm",
  "tools_used": "Caliper #M-042",
  "designed_char": true,
  "result": "pass",
  "deviation_reason": null,
  "characteristic_id": null
}

// FAIItemUpdate (PUT /fai/reports/{id}/items/{item_id})
{
  "actual_value": 25.02,
  "result": "pass"
}

// FAIRejectRequest (POST /fai/reports/{id}/reject)
{
  "reason": "Dimension 3 out of tolerance -- remeasure with calibrated instrument"
}
```

### Response Schemas (key fields)
```json
// FAIReportDetailResponse (from GET /fai/reports/{id})
{
  "id": 1,
  "plant_id": 1,
  "part_number": "OQ-PART-001",
  "part_name": "Test Widget",
  "revision": "A",
  "serial_number": "SN-001",
  "lot_number": "LOT-2026-001",
  "drawing_number": "DWG-001",
  "organization_name": "Saturnis Manufacturing",
  "supplier": "Parts Corp",
  "purchase_order": "PO-12345",
  "reason_for_inspection": "new_part",
  "material_supplier": "Alcoa",
  "material_spec": "Al 6061-T6",
  "special_processes": "[\"anodize\"]",
  "functional_test_results": null,
  "status": "draft",
  "created_by": 3,
  "created_at": "2026-02-26T10:00:00Z",
  "submitted_by": null,
  "submitted_at": null,
  "approved_by": null,
  "approved_at": null,
  "rejection_reason": null,
  "items": [
    {
      "id": 1,
      "report_id": 1,
      "balloon_number": 1,
      "characteristic_name": "Outer Diameter",
      "nominal": 25.00,
      "usl": 25.05,
      "lsl": 24.95,
      "actual_value": 25.01,
      "unit": "mm",
      "tools_used": "Caliper #M-042",
      "designed_char": true,
      "result": "pass",
      "deviation_reason": null,
      "characteristic_id": null,
      "sequence_order": 1
    }
  ]
}
```
