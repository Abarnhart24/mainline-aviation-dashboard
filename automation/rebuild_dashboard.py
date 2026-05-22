"""
Refresh the Goldberg's Group Missions Operations dashboard.

Behavior changed (May 2026): instead of replacing all dashboard data with
each export, we maintain an append-only master ledger. Each new CSV adds
ONLY non-duplicate rows. Duplicates are detected via a stable composite
key (Worksite + Asset + Outbound Flight + Mission Started).

Reads:
    - The newest MissionsSummary*.csv in TEST folder (excluding master,
      backups, archives, _for_Monday). This is treated as "incoming."
    - MissionsSummary_master.csv in TEST folder (the cumulative dataset).
      Created on first run if absent.

Writes:
    - MissionsSummary_master.csv (updated with newly-discovered rows)
    - Missions_Operations_Dashboard.html (rebuilt from master)
    - automation/backups/dashboard_backup_<timestamp>.html
    - automation/backups/master_backup_<timestamp>.csv

Usage:  python rebuild_dashboard.py [path-to-incoming-csv]
        If no path given, picks newest MissionsSummary*.csv in TEST.
"""
import csv
import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

TEST_DIR = Path(r"C:\Users\Tony Quach\OneDrive - Goldbergs Group\Desktop\TEST")
MASTER_PATH = TEST_DIR / "MissionsSummary_master.csv"
DASHBOARD_PATH = TEST_DIR / "Missions_Operations_Dashboard.html"
BACKUP_DIR = TEST_DIR / "automation" / "backups"
INTRA_SHIFT_MAX = 240  # minutes — gap above this counts as a different shift

# Original CSV column order (must match Springshot exports)
CSV_COLUMNS = [
    "Team Lead", "Airline", "Mission Type", "Worksite", "Asset",
    "Engagement", "Productivity", "Inbound Flight", "Outbound Flight",
    "Asset Type", "Location", "Event",
    "Flight Arrival", "Mission Assigned", "Mission Accepted",
    "Team Arrival", "Mission Started", "Mission Completed", "Flight Departure",
    "Security Search", "Details", "Mission Notes",
    "Arrival Delay",  # minutes — actual minus scheduled (positive = late)
]

# ---------- arrival delay helpers ----------
def _try_int(s):
    if not s or s in ("-", "N/A", "", None): return None
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None

def _compute_scheduled(started_field, delay_str, year):
    """Return the scheduled flight arrival as a Springshot-style display string.
    actual = scheduled + delay_minutes  →  scheduled = actual - delay_minutes.
    """
    delay = _try_int(delay_str)
    if delay is None or not started_field or started_field in ("-", ""):
        return ""
    actual = parse_ts(started_field, year)
    if not actual:
        return ""
    from datetime import timedelta
    sched = actual - timedelta(minutes=delay)
    # Match the same display format as actual ("May 04, 21:52, EDT")
    return sched.strftime("%b %d, %H:%M, EDT")

# ---------- name normalization ----------
NAME_REPLACEMENTS = {
    "Bobbie Jackson lll": "Bobbie Jackson III",
}
def clean_team_lead(s):
    if not s: return s
    s = re.sub(r"\s+", " ", s.strip())
    return NAME_REPLACEMENTS.get(s, s)

# ---------- key helpers ----------
def row_key(row):
    """Stable composite key identifying a unique mission.

    Worksite + Asset + Outbound Flight + Mission Started reliably identifies
    a mission: an aircraft can't depart from one airport on two different
    flight numbers at the same minute.
    """
    return (
        (row.get("Worksite") or "").strip(),
        (row.get("Asset") or "").strip(),
        (row.get("Outbound Flight") or "").strip(),
        (row.get("Mission Started") or "").strip(),
    )

def find_incoming_csv():
    """Pick newest MissionsSummary*.csv that isn't master/archive/backup/Monday."""
    excluded = ("master", "archive", "backup", "for_Monday")
    candidates = [
        p for p in TEST_DIR.glob("MissionsSummary*.csv")
        if not any(token in p.name.lower() for token in excluded)
    ]
    if not candidates:
        raise FileNotFoundError(
            f"No incoming MissionsSummary*.csv found in {TEST_DIR}. "
            "Drop a Springshot export into the folder before running."
        )
    return max(candidates, key=lambda p: p.stat().st_mtime)

# ---------- CSV merge ----------
def load_master():
    if not MASTER_PATH.exists():
        return [], set()
    with open(MASTER_PATH, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    keys = {row_key(r) for r in rows}
    return rows, keys

def merge_incoming(incoming_path: Path):
    """Append non-duplicate rows from incoming CSV into master.

    Returns (added, skipped, total_after) tuple.
    """
    master_rows, master_keys = load_master()
    print(f"[merge] master has {len(master_rows)} rows before merge")

    with open(incoming_path, encoding="utf-8-sig") as f:
        incoming_rows = list(csv.DictReader(f))
    print(f"[merge] incoming {incoming_path.name} has {len(incoming_rows)} rows")

    # Backup master before changing it
    if master_rows:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        shutil.copy2(MASTER_PATH, BACKUP_DIR / f"master_backup_{stamp}.csv")

    # Index master by key for O(1) lookup during cell-level merge
    master_idx = {row_key(r): r for r in master_rows}

    added = 0
    skipped = 0
    backfilled = 0
    for row in incoming_rows:
        # Normalize team-lead name BEFORE building the dedupe key so historical
        # variants merge correctly going forward
        if "Team Lead" in row:
            row["Team Lead"] = clean_team_lead(row.get("Team Lead", ""))
        k = row_key(row)
        if k in master_idx:
            # Cell-level merge: fill in any empty master cells from the incoming
            # version. Non-destructive — never overwrites existing master values.
            existing = master_idx[k]
            for col, val in row.items():
                if val not in (None, "") and not (existing.get(col) or "").strip():
                    existing[col] = val
                    backfilled += 1
            skipped += 1
            continue
        master_rows.append(row)
        master_idx[k] = row
        master_keys.add(k)
        added += 1

    if backfilled:
        print(f"[merge] backfilled {backfilled} empty cells in existing rows")

    # Write master back. Use the canonical column order; fall back to whatever
    # columns exist in the incoming file if a column is missing in CSV_COLUMNS.
    fieldnames = CSV_COLUMNS[:]
    extra = []
    if incoming_rows:
        for c in incoming_rows[0].keys():
            if c and c not in fieldnames:
                extra.append(c)
    fieldnames += extra

    with open(MASTER_PATH, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in master_rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    print(f"[merge] added {added} new rows, skipped {skipped} duplicates")
    print(f"[merge] master now has {len(master_rows)} rows total")
    return added, skipped, len(master_rows)

# ---------- enrichment (same as before) ----------
def pct(s):
    if not s or s in ("-", "N/A", ""):
        return None
    m = re.match(r"(-?\d+(?:\.\d+)?)%", s)
    return float(m.group(1)) if m else None

def parse_ts(s, year):
    if not s or s in ("-", ""):
        return None
    m = re.match(r"(\w+ \d+), (\d+:\d+)", s)
    if not m:
        return None
    try:
        return datetime.strptime(f"{year} {m.group(1)} {m.group(2)}", "%Y %b %d %H:%M")
    except Exception:
        return None

def enrich(rows, year=None):
    """Compute Proper, Response, Transit, On-Time, Duration, Month, Hour."""
    if year is None:
        year = datetime.now().year
    recs = []
    for r in rows:
        eng = pct(r.get("Engagement", ""))
        accepted = parse_ts(r.get("Mission Accepted", ""), year)
        team_arr = parse_ts(r.get("Team Arrival", ""), year)
        started = parse_ts(r.get("Mission Started", ""), year)
        completed = parse_ts(r.get("Mission Completed", ""), year)
        flight_dep = parse_ts(r.get("Flight Departure", ""), year)

        dur = None
        if started and completed:
            d = (completed - started).total_seconds() / 60
            if 0 < d < 600:
                dur = round(d, 1)
        on_time = None
        if completed and flight_dep:
            on_time = bool(completed <= flight_dep)
        resp = None
        if accepted and team_arr:
            rd = (team_arr - accepted).total_seconds() / 60
            if rd >= 0:
                resp = round(rd, 1)

        recs.append({
            "tl": r.get("Team Lead", "").strip(),
            "al": r.get("Airline", ""),
            "mt": r.get("Mission Type", ""),
            "ws": r.get("Worksite", ""),
            "ast": r.get("Asset", ""),
            "atype": r.get("Asset Type", ""),
            "loc": r.get("Location", ""),
            "eng": eng,
            "prod": pct(r.get("Productivity", "")),
            "inb": r.get("Inbound Flight", ""),
            "outb": r.get("Outbound Flight", ""),
            "fa": r.get("Flight Arrival", ""),
            "delay": _try_int(r.get("Arrival Delay", "")),
            "sched_fa": _compute_scheduled(started_field=r.get("Flight Arrival", ""), delay_str=r.get("Arrival Delay", ""), year=year),
            "ma": r.get("Mission Accepted", ""),
            "tarr": r.get("Team Arrival", ""),
            "ms": r.get("Mission Started", ""),
            "mc": r.get("Mission Completed", ""),
            "fd": r.get("Flight Departure", ""),
            "dur": dur,
            "ot": on_time,
            "resp": resp,
            "hr": started.hour if started else None,
            "mo": started.strftime("%b %Y") if started else None,
            "mo_idx": (started.year * 12 + started.month) if started else None,
            "proper": (eng is not None and eng > 0),
            "transit": None,
            "transit_kind": None,
            "_ms": started,
            "_mc": completed,
            "_tarr": team_arr,
        })

    by_lead = defaultdict(list)
    for i, r in enumerate(recs):
        by_lead[r["tl"]].append((i, r))
    for tl, lst in by_lead.items():
        proper = sorted(
            [(i, r) for (i, r) in lst if r["proper"] and r["_ms"] and r["_mc"] and r["_tarr"]],
            key=lambda x: x[1]["_ms"],
        )
        for k, (i, r) in enumerate(proper):
            if k == 0:
                recs[i]["transit_kind"] = "first"
            else:
                prev = proper[k - 1][1]
                gap = (r["_tarr"] - prev["_mc"]).total_seconds() / 60
                recs[i]["transit"] = round(gap, 1)
                if gap < 0:
                    recs[i]["transit_kind"] = "overlap"
                elif gap <= INTRA_SHIFT_MAX:
                    recs[i]["transit_kind"] = "intra"
                else:
                    recs[i]["transit_kind"] = "shift_break"
        for i, r in lst:
            if not r["proper"]:
                recs[i]["transit_kind"] = "skipped"

    for r in recs:
        r.pop("_ms", None)
        r.pop("_mc", None)
        r.pop("_tarr", None)
    return recs

# ---------- dashboard write ----------
def rewrite_dashboard(enriched_recs):
    if not DASHBOARD_PATH.exists():
        raise FileNotFoundError(
            f"Dashboard template not found at {DASHBOARD_PATH}. "
            "Run the dashboard build the first time before automating."
        )
    html = DASHBOARD_PATH.read_text(encoding="utf-8")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    shutil.copy2(DASHBOARD_PATH, BACKUP_DIR / f"dashboard_backup_{stamp}.html")

    new_data = "const RAW_MISSIONS = " + json.dumps(enriched_recs, separators=(",", ":")) + ";"
    new_html, count = re.subn(
        r"const RAW_MISSIONS = \[.*?\];", new_data, html, count=1, flags=re.DOTALL
    )
    if count != 1:
        raise RuntimeError(
            "Could not locate RAW_MISSIONS block in dashboard HTML — "
            "the template may have been edited by hand."
        )

    snapshot = datetime.now().strftime("%b %d, %Y at %I:%M %p EDT")
    new_html = re.sub(
        r'const SNAPSHOT_TIME = "[^"]*";',
        f'const SNAPSHOT_TIME = "{snapshot}";',
        new_html,
    )

    DASHBOARD_PATH.write_text(new_html, encoding="utf-8")
    print(f"[dashboard] wrote refreshed dashboard ({len(new_html)/1024:.1f} KB)")
    print(f"[dashboard] snapshot timestamp: {snapshot}")

# ---------- entry point ----------
def main():
    if len(sys.argv) > 1:
        incoming = Path(sys.argv[1])
    else:
        incoming = find_incoming_csv()

    print(f"[run] incoming CSV: {incoming}")

    # 1) Merge incoming into master (deduped append)
    added, skipped, total = merge_incoming(incoming)

    # 2) Read master, enrich, rebuild dashboard
    with open(MASTER_PATH, encoding="utf-8-sig") as f:
        master_rows = list(csv.DictReader(f))
    enriched = enrich(master_rows)
    print(f"[run] enriched {len(enriched)} master records")
    rewrite_dashboard(enriched)

    print(f"\n[run] SUMMARY:")
    print(f"      added {added}, skipped {skipped}, master total {total}")
    print(f"      dashboard: {DASHBOARD_PATH}")

if __name__ == "__main__":
    main()
