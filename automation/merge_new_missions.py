"""
merge_new_missions.py
─────────────────────
Drop new Springshot CSV exports into:  Sullivan Dashboard/Raw Data/New Missions/
Then tell Claude "merge new missions" — or run directly:
    python automation/merge_new_missions.py

What it does:
  1. Reads every CSV in the New Missions drop folder
  2. Deduplicates against MissionsSummary_master.csv
     (unique key = Airline + Asset + Mission Started timestamp)
  3. Appends new rows to the master CSV
  4. Moves processed files to Raw Data/New Missions/Processed/
  5. Prints a summary of rows added vs skipped
"""

import shutil, csv
from pathlib import Path
from datetime import datetime

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT     = Path(__file__).parent.parent
MASTER_CSV    = REPO_ROOT / "MissionsSummary_master.csv"

_SULLIVAN_DASH = REPO_ROOT.parent / "Sullivan Dashboard" / "Sullivan Dashboard"
DROP_DIR      = _SULLIVAN_DASH / "Raw Data" / "New Missions"
PROCESSED_DIR = DROP_DIR / "Processed"

# Fallback if Sullivan Dashboard path doesn't exist
if not DROP_DIR.parent.exists():
    DROP_DIR      = REPO_ROOT / "Raw Data" / "New Missions"
    PROCESSED_DIR = DROP_DIR / "Processed"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Unique key columns — these together identify one mission uniquely
KEY_COLS = ["Airline", "Asset", "Mission Started"]

# Expected columns (Springshot export format)
EXPECTED_COLS = [
    "Team Lead", "Airline", "Mission Type", "Worksite", "Asset",
    "Engagement", "Productivity", "Inbound Flight", "Outbound Flight",
    "Asset Type", "Location", "Event", "Flight Arrival", "Mission Assigned",
    "Mission Accepted", "Team Arrival", "Mission Started", "Mission Completed",
    "Flight Departure", "Security Search", "Details", "Mission Notes"
]


def make_key(row: dict) -> str:
    return "|".join(str(row.get(c, "")).strip() for c in KEY_COLS).upper()


def load_master_keys() -> set[str]:
    if not MASTER_CSV.exists():
        return set()
    with open(MASTER_CSV, newline="", encoding="utf-8-sig") as f:
        return {make_key(r) for r in csv.DictReader(f) if any(r.values())}


def load_master_headers() -> list[str]:
    if not MASTER_CSV.exists():
        return EXPECTED_COLS
    with open(MASTER_CSV, newline="", encoding="utf-8-sig") as f:
        return csv.DictReader(f).fieldnames or EXPECTED_COLS


def parse_csv(path: Path) -> tuple[list[str], list[dict]]:
    """Return (headers, rows) from a Springshot CSV export."""
    # Try a few encodings
    for enc in ["utf-8-sig", "utf-8", "latin-1"]:
        try:
            with open(path, newline="", encoding=enc) as f:
                reader = csv.DictReader(f)
                rows = [r for r in reader if any(v.strip() for v in r.values())]
                return reader.fieldnames or [], rows
        except UnicodeDecodeError:
            continue
    return [], []


def append_to_master(new_rows: list[dict], headers: list[str]) -> None:
    master_headers = load_master_headers()
    # Use master headers as canonical; new file may have same cols in same order
    write_headers = master_headers if master_headers else headers

    with open(MASTER_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=write_headers, extrasaction="ignore")
        for row in new_rows:
            writer.writerow(row)


def main():
    print(f"\n{'═'*60}")
    print("  Sullivan Rd — Missions Merge")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'═'*60}\n")

    files = [f for f in DROP_DIR.iterdir()
             if f.is_file() and f.suffix.lower() == ".csv"
             and f.parent == DROP_DIR]

    if not files:
        print("  No CSV files found in Raw Data/New Missions/")
        print("  Drop Springshot export CSVs there and run again.\n")
        return

    print(f"  Found {len(files)} file(s) to process.\n")

    existing_keys = load_master_keys()
    print(f"  Existing rows in MissionsSummary_master.csv: {len(existing_keys)}\n")

    total_added   = 0
    total_skipped = 0
    processed     = []

    for path in files:
        print(f"  ▶  {path.name}")
        headers, rows = parse_csv(path)

        if not rows:
            print(f"  ✗  No data found — skipping.\n")
            continue

        # Validate it looks like a Springshot file
        if "Team Lead" not in (headers or []) or "Mission Started" not in (headers or []):
            print(f"  ✗  Doesn't look like a Springshot export (missing key columns) — skipping.\n")
            continue

        new_rows = []
        dups     = 0
        for row in rows:
            key = make_key(row)
            if key in existing_keys:
                dups += 1
            else:
                new_rows.append(row)
                existing_keys.add(key)

        print(f"     Parsed {len(rows)} rows — {len(new_rows)} new, {dups} duplicates")

        if new_rows:
            append_to_master(new_rows, headers)
            total_added   += len(new_rows)
            total_skipped += dups
            print(f"     ✓  Added {len(new_rows)} rows to MissionsSummary_master.csv")
        else:
            print(f"     ✓  All rows already in master — nothing to add")

        processed.append(path)
        print()

    # Archive processed files
    for path in processed:
        dest = PROCESSED_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{path.name}"
        shutil.move(str(path), str(dest))
        print(f"  → Archived: {path.name}")

    print(f"\n{'─'*60}")
    print(f"  DONE — {total_added} rows added, {total_skipped} duplicates skipped")
    print(f"  MissionsSummary_master.csv is ready to commit and push.")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
