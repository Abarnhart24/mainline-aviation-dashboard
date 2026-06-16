"""
Mainline Aviation – Sullivan Rd Missions Dashboard Rebuild Script
-----------------------------------------------------------------
Usage (from repo root in VS Code terminal):
    python automation/rebuild_dashboard.py

  Or with an explicit incoming CSV:
    python automation/rebuild_dashboard.py "C:\\path\\to\\MissionsSummary.csv"

How it works:
  1. Reads the incoming Springshot CSV export (from Sullivan Dashboard folder by default)
  2. Merges new rows into MissionsSummary_master.csv (append-only, deduped)
  3. Enriches data (response times, transit gaps, on-time, etc.)
  4. Rewrites RAW_MISSIONS in Missions_Operations_Dashboard.html
  5. Updates SNAPSHOT_TIME in the HTML

After running: commit + push from VS Code to publish to GitHub Pages.
"""

import csv, json, re, math, sys
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# ── PATHS ────────────────────────────────────────────────────────────────────
REPO_DIR       = Path(__file__).resolve().parent.parent  # mainline-aviation-dashboard/
MASTER_CSV     = REPO_DIR / "MissionsSummary_master.csv"
DASHBOARD_HTML = REPO_DIR / "Missions_Operations_Dashboard.html"

# Default incoming CSV location — drop new Springshot exports here
DEFAULT_INCOMING = REPO_DIR / "MissionsSummary.csv"

# ── CONSTANTS ─────────────────────────────────────────────────────────────────
INTRA_SHIFT_MAX = 240  # minutes — gaps > this are shift breaks, not transit gaps

# ── HELPERS ──────────────────────────────────────────────────────────────────
def parse_dt(s):
    """Parse Springshot timestamp like 'Jun 16, 02:27, EDT' or common formats."""
    if not s or str(s).strip() in ('', 'nan', 'None', 'N/A'):
        return None
    s = str(s).strip()
    s = re.sub(r',\s*[A-Z]{2,4}$', '', s).strip()   # strip ", EDT" / ", EST"
    for fmt in (
        "%b %d, %H:%M",        # Jun 16, 02:27
        "%b %d, %I:%M %p",     # Jun 16, 2:27 AM
        "%m/%d/%Y %I:%M %p",   # 06/16/2026 2:27 AM
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.year == 1900:
                dt = dt.replace(year=datetime.now().year)
            return dt
        except:
            pass
    return None

def minutes_between(a, b):
    if a and b:
        return round((b - a).total_seconds() / 60, 1)
    return None

def normalize_name(n):
    """Fix common name issues from Springshot (lowercase L vs uppercase I, etc.)."""
    n = str(n).strip()
    n = re.sub(r'\blll\b', 'III', n)
    n = re.sub(r'\bll\b',  'II',  n)
    return n

def dedup_key(row):
    return (
        str(row.get('Worksite', '')).strip(),
        str(row.get('Asset', '')).strip(),
        str(row.get('Outbound Flight', '')).strip(),
        str(row.get('Mission Started', '')).strip(),
    )

def read_csv(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return [dict(r) for r in csv.DictReader(f)]

def parse_pct(v):
    try:
        s = str(v).strip().replace('%', '').replace(',', '')
        if s in ('N/A', '', 'None', 'nan'):
            return None
        return float(s)
    except:
        return None

def safe(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return v

# ── MERGE ────────────────────────────────────────────────────────────────────
def merge_incoming(master_rows, incoming_rows):
    """Append non-duplicate incoming rows to master. Returns combined list."""
    existing_keys = set(dedup_key(r) for r in master_rows)
    added = 0
    for row in incoming_rows:
        k = dedup_key(row)
        if k not in existing_keys:
            master_rows.append(row)
            existing_keys.add(k)
            added += 1
    print(f"  Merged: +{added} new rows  (total: {len(master_rows)})")
    return master_rows

# ── ENRICH ───────────────────────────────────────────────────────────────────
def enrich(rows):
    """Add computed fields to each row."""
    enriched = []
    for row in rows:
        r = dict(row)
        r['Team Lead'] = normalize_name(r.get('Team Lead', ''))

        t_accepted   = parse_dt(r.get('Mission Accepted'))
        t_arrival    = parse_dt(r.get('Team Arrival'))
        t_started    = parse_dt(r.get('Mission Started'))
        t_completed  = parse_dt(r.get('Mission Completed'))
        t_flight_arr = parse_dt(r.get('Flight Arrival'))

        # Response time: Mission Accepted → Team Arrival
        resp = minutes_between(t_accepted, t_arrival)
        r['_response_min'] = resp if (resp is not None and resp >= 0) else None

        # Mission duration
        dur = minutes_between(t_started, t_completed)
        r['_duration_min'] = dur if (dur is not None and dur >= 0) else None

        # On-time: team arrived at or before flight arrival
        if t_flight_arr and t_arrival:
            r['_on_time'] = t_arrival <= t_flight_arr
        else:
            r['_on_time'] = None

        # Date/time grouping
        if t_started:
            r['_month'] = t_started.strftime('%b %Y')   # e.g. "Jun 2026"
            r['_hour']  = t_started.hour
            r['_date']  = t_started.strftime('%Y-%m-%d')
        else:
            r['_month'] = r['_hour'] = r['_date'] = None

        r['_engagement_pct']   = parse_pct(r.get('Engagement'))
        r['_productivity_pct'] = parse_pct(r.get('Productivity'))

        # Keep parsed timestamps for transit gap calc
        r['_t_completed'] = t_completed
        r['_t_arrival']   = t_arrival
        r['_t_started']   = t_started

        enriched.append(r)

    # Intra-shift transit gaps (per team lead per day)
    by_key = defaultdict(list)
    for r in enriched:
        if r.get('Team Lead') and r.get('_date'):
            by_key[(r['Team Lead'], r['_date'])].append(r)

    for missions in by_key.values():
        missions.sort(key=lambda x: x['_t_started'] or datetime.min)
        for i, m in enumerate(missions):
            if i == 0:
                m['_transit_gap_min'] = None
            else:
                gap = minutes_between(missions[i-1]['_t_completed'], m['_t_arrival'])
                m['_transit_gap_min'] = gap if (gap is not None and 0 <= gap <= INTRA_SHIFT_MAX) else None

    return enriched

# ── REWRITE HTML ─────────────────────────────────────────────────────────────
def row_to_json(r):
    # Keys MUST match compact format used by dashboard JS (tl, al, mt, etc.)
    t_started   = r.get('_t_started')
    t_completed = r.get('_t_completed')
    mo_idx = None
    if t_started:
        mo_idx = t_started.year * 12 + t_started.month
    transit_kind = None
    gap = r.get('_transit_gap_min')
    if gap is None:
        transit_kind = "first"
    elif gap <= 240:
        transit_kind = "intra"
    else:
        transit_kind = "shift_break"
    return {
        "tl":    r.get('Team Lead', ''),
        "al":    r.get('Airline', ''),
        "mt":    r.get('Mission Type', ''),
        "ws":    r.get('Worksite', ''),
        "ast":   r.get('Asset', ''),
        "atype": r.get('Asset Type', ''),
        "loc":   r.get('Location', ''),
        "eng":   safe(r.get('_engagement_pct')),
        "prod":  safe(r.get('_productivity_pct')),
        "inb":   r.get('Inbound Flight', ''),
        "outb":  r.get('Outbound Flight', ''),
        "fa":    r.get('Flight Arrival', ''),
        "delay": None,
        "sched_fa": r.get('Scheduled Flight Arrival', '') or '',
        "ma":    r.get('Mission Assigned', ''),
        "tarr":  r.get('Team Arrival', ''),
        "ms":    r.get('Mission Started', ''),
        "mc":    r.get('Mission Completed', ''),
        "fd":    r.get('Flight Departure', ''),
        "dur":   safe(r.get('_duration_min')),
        "ot":    safe(r.get('_on_time')),
        "resp":  safe(r.get('_response_min')),
        "hr":    safe(r.get('_hour')),
        "mo":    r.get('_month') or '',
        "mo_idx": mo_idx,
        "proper": True,
        "transit": safe(gap),
        "transit_kind": transit_kind,
    }

def rewrite_dashboard(enriched_recs):
    html     = DASHBOARD_HTML.read_text(encoding='utf-8')
    json_str = json.dumps([row_to_json(r) for r in enriched_recs])
    snapshot = datetime.now().strftime('%Y-%m-%d %H:%M')

    # Line-by-line replacement — regex fails on huge single-line JSON
    lines = html.split('\n')
    new_lines = []
    for line in lines:
        if line.strip().startswith('const RAW_MISSIONS'):
            new_lines.append(f'const RAW_MISSIONS = {json_str};')
        elif line.strip().startswith('const SNAPSHOT_TIME'):
            # Only replace the declaration line, not references inside strings/regexes
            new_lines.append(re.sub(r'const SNAPSHOT_TIME\s*=\s*"[^"]*"',
                                    f'const SNAPSHOT_TIME = "{snapshot}"', line))
        else:
            new_lines.append(line)

    DASHBOARD_HTML.write_text('\n'.join(new_lines), encoding='utf-8')
    print(f"  Dashboard rewritten: {len(enriched_recs)} missions  snapshot={snapshot}")

# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    incoming_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INCOMING

    if not incoming_path.exists():
        print(f"ERROR: Incoming CSV not found: {incoming_path}")
        print(f"       Drop a MissionsSummary.csv into: {REPO_DIR}")
        sys.exit(1)

    print(f"Incoming CSV:  {incoming_path}")
    print(f"Master CSV:    {MASTER_CSV}")
    print(f"Dashboard:     {DASHBOARD_HTML}")
    print()

    print("Reading files...")
    incoming = read_csv(incoming_path)
    master   = read_csv(MASTER_CSV) if MASTER_CSV.exists() else []
    print(f"  Incoming: {len(incoming)} rows   Master: {len(master)} rows")

    print("Merging...")
    merged = merge_incoming(master, incoming)

    print("Enriching...")
    enriched = enrich(merged)

    print("Rewriting dashboard HTML...")
    rewrite_dashboard(enriched)

    print("Saving master CSV...")
    fieldnames = list(incoming[0].keys()) if incoming else list(master[0].keys())
    with open(MASTER_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(merged)
    print(f"  Saved: {len(merged)} rows")

    # Print summary
    total    = len(enriched)
    on_time  = sum(1 for r in enriched if r.get('_on_time') is True)
    off_time = sum(1 for r in enriched if r.get('_on_time') is False)
    with_resp = [r['_response_min'] for r in enriched if r.get('_response_min') is not None]
    with_gap  = [r['_transit_gap_min'] for r in enriched if r.get('_transit_gap_min') is not None]
    pcts      = [r['_productivity_pct'] for r in enriched if r.get('_productivity_pct') is not None]

    print()
    print("=" * 40)
    print(f"Total missions:    {total}")
    if on_time + off_time > 0:
        print(f"On-time rate:      {on_time/(on_time+off_time)*100:.1f}%  ({on_time}/{on_time+off_time})")
    if with_resp:
        print(f"Avg response:      {sum(with_resp)/len(with_resp):.1f} min")
    if with_gap:
        print(f"Avg transit gap:   {sum(with_gap)/len(with_gap):.1f} min")
    if pcts:
        print(f"Avg productivity:  {sum(pcts)/len(pcts):.1f}%")
    print("=" * 40)
    print()
    print("Done. Now commit + push from VS Code to publish.")
