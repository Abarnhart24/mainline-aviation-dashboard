# Sullivan Rd — Raw Data Analysis
**Generated:** June 18, 2026  
**Files analyzed:**
- `Raw Data/Virgin/18062026invoiceDetailReport.xlsx` — 34,784 line items
- `Raw Data/SAS/SAS full detail.csv` — 2,962 line items
- `Raw Data/Ethiopian/Mainline Aviation - ET Invoice NEW revised.xlsx` — May invoice
- `Raw Data/Ethiopian/Mainline Aviation - June.xlsx` — June invoice

---

## Executive Summary

| Airline | Period | Revenue | Flights | Avg/Flight | Status |
|---------|--------|---------|---------|------------|--------|
| Virgin Atlantic (VS) | Jan 1 – Jun 13, 2026 | $2,100,919 | 311 | $6,756 | 98.9% Paid |
| SAS (SK) | May 2–31, 2026 | $129,144 | 20 | $6,457 | All PA (not yet paid) |
| Ethiopian (ET) | May 22–Jun 1, 2026 | ~$55,228* | 5 | $11,046 | Invoiced/submitted |

*ET June invoice has a data issue — see section below.

Virgin Atlantic dominates at roughly **90% of total revenue** across these files.

---

## Virgin Atlantic (VS)

### Revenue by Month

| Month | Revenue | Flights | Avg/Flight | vs Prior Month |
|-------|---------|---------|------------|----------------|
| Jan 2026 | $367,883 | 59 | $6,235 | — |
| Feb 2026 | $302,045 | 49 | $6,164 | −18% (fewer days) |
| Mar 2026 | $365,410 | 54 | $6,767 | +21% |
| Apr 2026 | $425,874 | 60 | $7,098 | +16% |
| May 2026 | $447,203 | 62 | $7,213 | +2% |
| Jun 2026 (partial, thru 6/13) | $192,504 | 27 | $7,130 | on pace |
| **TOTAL** | **$2,100,919** | **311** | | |

Per-flight average has grown **+15.7% from January to May** ($6,235 → $7,213), which is a strong positive trend.

### Flight Operations

Three active flight numbers observed:
- **V104** (daily): Higher load — typically 215–235 invoiced pax, averaging ~$8,000/flight
- **V110** (daily): Lower load — typically 140–175 invoiced pax, averaging ~$6,000/flight
- **V116** (appeared June only): New or seasonal addition — needs monitoring

Both V104 and V110 operate ATL → LHR. The revenue difference between them tracks with pax load.

### Revenue by Cabin Class

| Class | Revenue | % of Total |
|-------|---------|------------|
| AC (aircraft/galley overhead) | $772,807 | 36.8% |
| Y (Economy) | $617,751 | 29.4% |
| J (Business) | $372,244 | 17.7% |
| W (Premium Economy) | $261,648 | 12.5% |
| CC (Crew Catering) | $76,470 | 3.6% |

Note: The AC class likely represents shared aircraft charges (garbage, overhead, dry ice, turnaround) billed per flight rather than per passenger.

### Revenue by Service Group (Top 10)

| Service Group | Revenue | Notes |
|---------------|---------|-------|
| TSU (Tray Setup) | $328,144 | Largest single category |
| ENT (Entrées) | $312,025 | Primary food revenue |
| Wash Up | $243,439 | Service labor/equipment |
| Overhead | $216,435 | Fixed per-flight charges |
| BRK (Breakfast) | $216,392 | Strong breakfast program |
| SPML (Special Meals) | $165,671 | Dietary/special orders |
| Garbage | $113,000 | Fixed waste handling |
| Turnaround | $104,020 | Between-flight service |
| DES (Dessert) | $58,820 | |
| BOX (Boxed meals) | $56,490 | |

### Payment Status

| Status | Amount | % |
|--------|--------|---|
| Paid | $2,078,418 | 98.9% |
| Approved (pending payment) | $12,015 | 0.6% |
| Pending (under review) | $10,486 | 0.5% |

Payment health is excellent. The $22K in Approved/Pending is likely recent June invoices not yet processed.

### Observations & Flags

1. **Revenue trend is strong** — per-flight average up 15.7% Jan→May. Either load factors are growing, or pricing has increased, or service scope has expanded.
2. **February dip** is calendar-driven (fewer flights due to month length) — not a concern.
3. **V116 appeared in June** — confirm this is a new flight and that catering scope/pricing has been set up correctly.
4. **TSU + ENT = $640K combined** — these are the two largest categories and likely the most sensitive to pax count accuracy. Worth auditing invoiced pax vs. actual pax periodically. The data shows `Invoiced Pax` and `Actual Pax` fields — discrepancies should be reviewed.

---

## SAS (SK)

### Overview

| Metric | Value |
|--------|-------|
| Period | May 2–31, 2026 |
| Total Revenue | $129,144 |
| Total Invoices | 20 (one per flight date) |
| Flight frequency | ~5 flights/week |
| Avg per invoice | $6,457 |

### Per-Invoice Revenue

All 20 May invoices are remarkably consistent (~$6,200–$6,550) with a notable uptick in the last week of May:

| Invoice | Date | Revenue |
|---------|------|---------|
| SK-7776698 | May 2 | $6,237 |
| SK-7776699 | May 3 | $6,394 |
| ... | ... | ~$6,350 avg |
| SK-7788737 | May 28 | $6,789 |
| SK-7789255 | May 29 | $6,943 |
| SK-7789256 | May 31 | $7,002 |
| SK-7789257 | May 30 | $6,805 |

The final four invoices of May average **$6,885** — about 7% above the rest of the month. This could reflect higher pax loads at month end or an extra service add-on. Worth investigating.

### Revenue by Cabin Class

| Class | Revenue | Notes |
|-------|---------|-------|
| M (Economy/Full) | $54,243 | 42% — dominant class |
| C (Business) | $29,642 | 23% |
| Y (Economy discounted) | $24,598 | 19% |
| X (Group/Charter Economy) | $19,174 | 15% |
| P (First) | $878 | <1% |
| K (Other) | $611 | <1% |

### Payment Status — FLAG

All 20 invoices carry status **"PA" (Partially Approved)**. One invoice (SK-7786867, May 24) is **"PC" (Partially Confirmed/Closed)**. The `Total Payment` column is **$0.00 across all rows**, meaning no payments have been collected against these invoices yet.

This is the most significant finding in the SAS data — **$129,144 is outstanding and unconfirmed.** Follow up with SAS on payment timeline.

### Observations & Flags

1. **No June data yet** — only May is present. June SAS data needs to be added.
2. **All invoices in PA status** — payment has not been received or fully approved. Escalate collection.
3. **19 of 20 dates fall on unique single days** — one invoice per flight, which is the expected pattern. Verify no flights were missed.
4. **End-of-May revenue spike** — last 4 invoices are 7% above average. Confirm this is legitimate volume and not a billing error.
5. **Cabin X (Group Economy) is $19K** — relatively large for what's typically a low-volume class. Worth reviewing what's being billed there.

---

## Ethiopian Airlines (ET)

### May Invoice (ET202605B)

4 flights on ET519 (ATL→ADD, B787-900, departs 10:50):

| Flight Date | Sales # | Business Pax | Economy Pax | Food Revenue | Service Fee | Total |
|-------------|---------|-------------|-------------|-------------|-------------|-------|
| May 22, 2026 | ET20260522 | 20 | 231 | $10,358 | $1,050 | $11,408 |
| May 25, 2026 | ET20260525 | 22 | 239 | $10,093 | $1,050 | $11,143 |
| May 27, 2026 | ET20260527 | 20 | 225 | $9,724 | $1,050 | $10,774 |
| May 29, 2026 | ET20260529 | 22 | 222 | $9,444 | $1,050 | $10,494 |
| **Total** | | | | **$39,620** | **$4,200** | **$43,820** |

### June Invoice (ET202606A) — DATA ISSUE ⚠️

The `AR Invoice` tab of the June file shows **May 25, 27, and 29 dates** — these are duplicates of data in the May invoice. However, the delivery notes (DN sheets) correctly show:
- **DN01 = June 1, 2026** (the actual first June flight, Sales# ET20260601, 20 biz pax, 231 econ pax)
- DN02–DN13 = appear to be template carryovers with placeholder dates

This means the June invoice AR Invoice tab was not properly updated when the file was saved. **The actual June 1 flight data exists in the delivery notes but the AR Invoice export reflects stale data.** The correct June 1 invoice value (based on pax counts similar to May) would be approximately **$10,358–$11,408**.

The June invoice total as exported ($32,412) is **not reliable** — it counts May data twice.

### Delivery Schedule

ET519 runs approximately every 2–3 days. Based on May pattern (22nd, 25th, 27th, 29th), expect roughly 10–13 flights per month.

### Revenue Profile

| Category | Per Flight | Notes |
|----------|-----------|-------|
| Food Sales (acct 411001) | ~$9,900 | Varies with pax load |
| Service Fee (acct 413909) | $1,050 | Fixed per flight |
| **Total per flight** | **~$10,950** | |

Service fee is a flat $1,050/flight regardless of pax count — this is a fixed handling charge.

Food revenue tracks closely with economy pax count. At ~$38–42/pax for 220–240 economy pax, the per-pax food rate appears consistent.

### Observations & Flags

1. **June AR Invoice tab is incorrect** — contains May 25–29 data instead of June 1+ data. The template was not updated. Either regenerate the AR Invoice export or manually correct before submitting to Sage Intacct.
2. **Only 1 confirmed June flight in the data** (June 1) — need delivery notes for remaining June flights (June 3, 5, 8, etc.) to complete the June invoice.
3. **Food revenue declining slightly May 22→29** ($10,358 → $9,444) — could reflect lower economy pax load toward end of month. Business pax stayed at 20–22. Monitor for trend.
4. **Service fee is flat at $1,050/flight** — confirm this is the current contracted rate and has not changed.
5. **The `Sheet1` tab** in both ET files contains notes about billing corrections (standard uplift, laundry, handling, custom clearance charges). These suggest there were prior billing disputes or corrections that needed to be incorporated into the pricing model — worth reviewing to ensure the current invoice structure is accurate.

---

## Cross-Airline Summary & Priorities

### Revenue Concentration Risk
Virgin Atlantic is ~90% of total revenue ($2.1M of ~$2.3M tracked). SAS and Ethiopian combined are under $200K. Any disruption to the VS contract would be significant.

### Immediate Action Items

| Priority | Item | Airline |
|----------|------|---------|
| 🔴 High | Follow up on $129K in PA/unconfirmed invoices | SAS |
| 🔴 High | Fix June AR Invoice tab before Sage Intacct submission | ET |
| 🟡 Medium | Obtain June SAS data (not yet in folder) | SAS |
| 🟡 Medium | Complete June ET delivery notes (only June 1 present) | ET |
| 🟡 Medium | Verify V116 scope/pricing is set up correctly | VS |
| 🟢 Low | Investigate end-of-May SAS revenue spike (+7%) | SAS |
| 🟢 Low | Review invoiced vs. actual pax discrepancies in VS data | VS |

### Data Gaps (files Tony mentioned are not done yet)
The following airlines from the dashboard have no raw data files yet:
- **American Airlines (AA)** — no raw data folder present
- **SAS June 2026** — May only in current file
- **Ethiopian June 2026** — only June 1 delivery note present, remainder needed
