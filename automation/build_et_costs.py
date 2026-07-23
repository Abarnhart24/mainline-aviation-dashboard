#!/usr/bin/env python3
"""
Mainline Aviation — Ethiopian Airlines Cost Aggregator
======================================================
Reads the Flight Cost Tracker Excel and writes Ethiopian food cost
data into data/hub_data.json so the dashboard reflects actual costs.

Called automatically by UPDATE_DASHBOARD.bat after build_hub_data.py.
"""

import json
import os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACKER = os.path.join(ROOT, "Pricing", "etheopian", "ET_Flight_Cost_Tracker.xlsx")
HUB_JSON = os.path.join(ROOT, "data", "hub_data.json")

MONTH_MAP = {
    "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
    "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"
}

def parse_date(val):
    """Return (YYYY, MM, display_month) or None."""
    if not val:
        return None
    import re
    s = str(val).strip()
    # Excel date serial or string like 2026-06-01 / 06/01/2026
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
        try:
            dt = datetime.strptime(s.split(" ")[0], fmt.split(" ")[0])
            return dt.year, f"{dt.month:02d}", f"{MONTH_MAP[f'{dt.month:02d}']} {dt.year}"
        except:
            pass
    return None

def read_tracker():
    """
    Read the Flight Cost Tracker sheet.
    Returns list of dicts: {date, month_label, hbf_cost, lch_cost,
                             hcp_swh_cost, specials_cost, dry_cost,
                             misc_cost, total_cost}
    """
    try:
        import pandas as pd
        df = pd.read_excel(TRACKER, sheet_name="Flight Cost Tracker",
                           header=3)   # row 4 is headers (0-indexed: row 3)
    except Exception as e:
        print(f"  [ET costs] Could not read tracker: {e}")
        return []

    rows = []
    for _, r in df.iterrows():
        date_val = r.iloc[0]  # Column A: Date
        parsed = parse_date(date_val)
        if not parsed:
            continue

        year, mm, month_label = parsed

        def safe(v):
            try:
                f = float(v)
                return f if f == f else 0.0   # NaN check
            except:
                return 0.0

        # Cost columns are AO-AT (indices 40-45, 0-based after header)
        # In the dataframe that's columns 40..45
        cols = list(r)
        hbf    = safe(cols[40]) if len(cols) > 40 else 0
        lch    = safe(cols[41]) if len(cols) > 41 else 0
        hcp    = safe(cols[42]) if len(cols) > 42 else 0
        spc    = safe(cols[43]) if len(cols) > 43 else 0
        dry    = safe(cols[44]) if len(cols) > 44 else 0
        misc   = safe(cols[45]) if len(cols) > 45 else 0
        total  = hbf + lch + hcp + spc + dry + misc

        if total > 0:
            rows.append({
                "date":         str(date_val)[:10],
                "month_label":  month_label,
                "year":         year,
                "mm":           mm,
                "hbf_cost":     round(hbf,  2),
                "lch_cost":     round(lch,  2),
                "hcp_swh_cost": round(hcp,  2),
                "specials_cost":round(spc,  2),
                "dry_cost":     round(dry,  2),
                "misc_cost":    round(misc, 2),
                "food_cost":    round(total,2),
            })

    return rows

def aggregate_by_month(rows):
    """Sum food costs by month label. Returns {month_label: food_cost}"""
    totals = {}
    for r in rows:
        lbl = r["month_label"]
        totals[lbl] = round(totals.get(lbl, 0) + r["food_cost"], 2)
    return totals

def update_hub_json(monthly_costs):
    """Merge Ethiopian food costs into hub_data.json."""
    if not os.path.exists(HUB_JSON):
        print("  [ET costs] hub_data.json not found — run build_hub_data.py first")
        return

    with open(HUB_JSON) as f:
        hub = json.load(f)

    atl = hub.get("cities", {}).get("ATL", {})
    airlines = atl.get("airlines", {})
    et = airlines.get("ET", {})
    existing_months = {m["month"]: m for m in et.get("months", [])}

    # Merge: update food_cost for months we have tracker data for
    for month_label, food_cost in monthly_costs.items():
        if month_label in existing_months:
            existing_months[month_label]["food_cost"] = food_cost
        else:
            # Add new month entry — revenue unknown until Sage export
            existing_months[month_label] = {
                "month":     month_label,
                "revenue":   0,
                "food_cost": food_cost
            }

    # Rebuild sorted months list
    month_order = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]
    def sort_key(m):
        parts = m["month"].split()
        mo = month_order.index(parts[0]) if parts[0] in month_order else 99
        yr = int(parts[1]) if len(parts) > 1 else 0
        return (yr, mo)

    et["months"] = sorted(existing_months.values(), key=sort_key)

    if "ET" not in airlines:
        et["label"] = "Ethiopian Airlines"
        et["color"] = "#f59e0b"
        et["missions"] = et.get("missions", 0)
        et["ontime_pct"] = et.get("ontime_pct", None)

    airlines["ET"] = et
    atl["airlines"] = airlines
    hub["cities"]["ATL"] = atl
    hub["_meta"]["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    hub["_meta"]["et_costs_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    with open(HUB_JSON, "w") as f:
        json.dump(hub, f, indent=2)

def build():
    print("\n  [ET costs] Reading Flight Cost Tracker...")

    if not os.path.exists(TRACKER):
        print(f"  [ET costs] Tracker not found at {TRACKER} — skipping")
        return

    rows = read_tracker()
    if not rows:
        print("  [ET costs] No flight data found in tracker — skipping")
        return

    print(f"  [ET costs] Found {len(rows)} flights with cost data")
    monthly = aggregate_by_month(rows)

    for month, cost in sorted(monthly.items()):
        print(f"    {month}: ${cost:,.2f}")

    update_hub_json(monthly)
    print(f"  [ET costs] hub_data.json updated with Ethiopian food costs\n")

if __name__ == "__main__":
    build()
