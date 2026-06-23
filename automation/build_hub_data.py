#!/usr/bin/env python3
"""
Mainline Aviation — Brain / Data Center
========================================
Run this script after dropping new reports into any Reports/ folder.
It reads all source files and rebuilds data/hub_data.json.

Usage:
    python automation/build_hub_data.py

What it reads:
    Reports/ATL/Revenue/     → Sage Intacct invoice exports (CSV or XLSX)
    Reports/ATL/FoodCost/    → Food cost reports (CSV or XLSX)
    Reports/ATL/Labor/       → Labor/payroll reports (CSV or XLSX)
    Reports/ATL/Missions/    → Springshot mission exports (CSV)
    Reports/BNA/...          → Same structure for Nashville (when active)

What it writes:
    data/hub_data.json       → Loaded by index.html at page load
"""

import json
import os
import glob
from datetime import datetime

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS_DIR = os.path.join(ROOT, "Reports")
OUTPUT_FILE = os.path.join(ROOT, "data", "hub_data.json")

# ── City / airline config ──────────────────────────────────────────────────────
CITY_CONFIG = {
    "ATL": {"name": "Atlanta", "airport": "Hartsfield-Jackson International", "active": True},
    "BNA": {"name": "Nashville", "airport": "Nashville International", "active": False},
}

AIRLINE_CONFIG = {
    "AA": {"label": "American Airlines",  "color": "#3b82f6"},
    "VS": {"label": "Virgin Atlantic",    "color": "#8b5cf6"},
    "SK": {"label": "SAS Scandinavian",   "color": "#22c55e"},
    "ET": {"label": "Ethiopian Airlines", "color": "#f59e0b"},
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def read_csv_or_xlsx(filepath):
    """Read a CSV or XLSX file into a list of dicts."""
    try:
        import pandas as pd
        if filepath.endswith(".xlsx") or filepath.endswith(".xls"):
            return pd.read_excel(filepath).to_dict("records")
        else:
            return pd.read_csv(filepath).to_dict("records")
    except ImportError:
        # Fallback: basic CSV reader (no pandas)
        import csv
        with open(filepath, newline="", encoding="utf-8-sig") as f:
            return list(csv.DictReader(f))

def find_reports(city, folder):
    """Return all CSV/XLSX files in Reports/{city}/{folder}/"""
    path = os.path.join(REPORTS_DIR, city, folder)
    if not os.path.exists(path):
        return []
    files = glob.glob(os.path.join(path, "*.csv")) + \
            glob.glob(os.path.join(path, "*.xlsx")) + \
            glob.glob(os.path.join(path, "*.xls"))
    return sorted(files)

# ── Revenue parser ────────────────────────────────────────────────────────────
def parse_revenue(city):
    """
    Expects Sage Intacct CSV with columns:
        Airline, Month, Revenue, FoodCost
    OR the Sullivan_Financials.xlsx format already used.
    Returns dict: { airline_code: [ {month, revenue, food_cost}, ... ] }
    """
    files = find_reports(city, "Revenue")
    if not files:
        print(f"  [Revenue/{city}] No files found — using existing data")
        return None

    combined = {}
    for f in files:
        print(f"  [Revenue/{city}] Reading {os.path.basename(f)}")
        rows = read_csv_or_xlsx(f)
        for row in rows:
            # Try common column name variants
            airline = (row.get("Airline") or row.get("airline") or row.get("Code") or "").strip().upper()
            month   = (row.get("Month")   or row.get("month")   or row.get("Period") or "").strip()
            revenue = float(row.get("Revenue")  or row.get("revenue")  or row.get("Total") or 0)
            food    = float(row.get("FoodCost") or row.get("Food Cost") or row.get("food_cost") or 0)

            if airline not in AIRLINE_CONFIG or not month:
                continue
            if airline not in combined:
                combined[airline] = {}
            if month not in combined[airline]:
                combined[airline][month] = {"revenue": 0, "food_cost": 0}
            combined[airline][month]["revenue"]   += revenue
            combined[airline][month]["food_cost"] += food

    # Convert to list format
    result = {}
    for al, months in combined.items():
        result[al] = [{"month": m, "revenue": v["revenue"], "food_cost": v["food_cost"]}
                      for m, v in sorted(months.items())]
    return result

# ── Food cost parser ──────────────────────────────────────────────────────────
def parse_food_cost(city):
    """
    Separate food cost report if not included in Revenue export.
    Expects columns: Airline, Month, Amount
    """
    files = find_reports(city, "FoodCost")
    if not files:
        return None

    combined = {}
    for f in files:
        print(f"  [FoodCost/{city}] Reading {os.path.basename(f)}")
        rows = read_csv_or_xlsx(f)
        for row in rows:
            airline = (row.get("Airline") or row.get("airline") or "").strip().upper()
            month   = (row.get("Month")   or row.get("month")   or "").strip()
            amount  = float(row.get("Amount") or row.get("FoodCost") or row.get("food_cost") or 0)
            if airline not in AIRLINE_CONFIG or not month:
                continue
            if airline not in combined:
                combined[airline] = {}
            combined[airline][month] = combined[airline].get(month, 0) + amount

    return combined  # { airline: { month: amount } }

# ── Labor parser ──────────────────────────────────────────────────────────────
def parse_labor(city):
    """
    Expects columns: Month, Amount (city-wide labor, not broken down by airline)
    Returns { month: amount }
    """
    files = find_reports(city, "Labor")
    if not files:
        return None

    combined = {}
    for f in files:
        print(f"  [Labor/{city}] Reading {os.path.basename(f)}")
        rows = read_csv_or_xlsx(f)
        for row in rows:
            month  = (row.get("Month")  or row.get("month")  or row.get("Period") or "").strip()
            amount = float(row.get("Amount") or row.get("Labor") or row.get("labor") or 0)
            if not month:
                continue
            combined[month] = combined.get(month, 0) + amount

    return combined  # { month: amount }

# ── Missions parser ───────────────────────────────────────────────────────────
def parse_missions(city):
    """
    Reads MissionsSummary CSVs.
    Expects columns: Airline (or al_code), OnTime (bool or 0/1)
    Returns { airline_code: { missions: N, ontime_pct: X } }
    """
    files = find_reports(city, "Missions")
    # Also check the root CSV for ATL
    if city == "ATL":
        root_csv = os.path.join(ROOT, "MissionsSummary_master.csv")
        if os.path.exists(root_csv):
            files = [root_csv] + files

    if not files:
        return None

    from collections import defaultdict
    counts = defaultdict(lambda: {"total": 0, "ontime": 0})

    for f in files:
        print(f"  [Missions/{city}] Reading {os.path.basename(f)}")
        rows = read_csv_or_xlsx(f)
        for row in rows:
            al = (row.get("al_code") or row.get("Airline") or row.get("airline") or "").strip().upper()
            ot_raw = row.get("on_time") or row.get("OnTime") or row.get("on time") or ""
            try:
                ot = float(str(ot_raw)) > 0 or str(ot_raw).strip().upper() in ("TRUE","YES","1","Y")
            except:
                ot = False
            if al in AIRLINE_CONFIG:
                counts[al]["total"] += 1
                if ot:
                    counts[al]["ontime"] += 1

    result = {}
    for al, c in counts.items():
        result[al] = {
            "missions": c["total"],
            "ontime_pct": round(c["ontime"] / c["total"] * 100, 1) if c["total"] > 0 else None
        }
    return result

# ── Load existing data as fallback ────────────────────────────────────────────
def load_existing():
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            return json.load(f)
    return {"cities": {}}

# ── Main build ────────────────────────────────────────────────────────────────
def build():
    print(f"\n{'='*56}")
    print("  Mainline Aviation — Building hub_data.json")
    print(f"{'='*56}\n")

    existing = load_existing()
    output = {
        "_meta": {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "note": "Auto-generated by automation/build_hub_data.py"
        },
        "cities": {}
    }

    for city_code, cfg in CITY_CONFIG.items():
        print(f"Processing {city_code} — {cfg['name']}")
        ex_city = existing.get("cities", {}).get(city_code, {})

        revenue_data  = parse_revenue(city_code)
        food_override = parse_food_cost(city_code)
        labor_data    = parse_labor(city_code)
        missions_data = parse_missions(city_code)

        # Build airline records
        airlines = {}
        for al_code, al_cfg in AIRLINE_CONFIG.items():
            ex_al = ex_city.get("airlines", {}).get(al_code, {})

            # Months — from new revenue file or fallback to existing
            if revenue_data and al_code in revenue_data:
                months = revenue_data[al_code]
                # Overlay food cost from separate file if provided
                if food_override and al_code in food_override:
                    for m in months:
                        if m["month"] in food_override[al_code]:
                            m["food_cost"] = food_override[al_code][m["month"]]
            else:
                months = ex_al.get("months", [])

            # Missions
            if missions_data and al_code in missions_data:
                ms = missions_data[al_code]["missions"]
                ot = missions_data[al_code]["ontime_pct"]
            else:
                ms = ex_al.get("missions", 0)
                ot = ex_al.get("ontime_pct", None)

            if months or ms:
                airlines[al_code] = {
                    "label":      al_cfg["label"],
                    "color":      al_cfg["color"],
                    "missions":   ms,
                    "ontime_pct": ot,
                    "months":     months
                }

        # Labor (city-wide)
        if labor_data:
            labor = [{"month": m, "amount": a} for m, a in sorted(labor_data.items())]
        else:
            labor = ex_city.get("labor", None)

        output["cities"][city_code] = {
            "name":    cfg["name"],
            "airport": cfg["airport"],
            "active":  cfg["active"],
            "airlines": airlines,
            "labor":    labor
        }

        al_count = len([a for a in airlines.values() if a["months"]])
        print(f"  Done — {al_count} airlines with data, labor: {'yes' if labor else 'no'}\n")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Written: {OUTPUT_FILE}")
    print(f"Updated: {output['_meta']['last_updated']}")
    print(f"\nNext: commit data/hub_data.json and push to GitHub\n")

if __name__ == "__main__":
    build()
