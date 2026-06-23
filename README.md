# Mainline Aviation — Business Intelligence Hub

## How it works

The dashboard reads from `data/hub_data.json`.
That file is rebuilt automatically when you run `UPDATE_DASHBOARD.bat`.

---

## Where to put things

```
mainline-aviation-dashboard/
│
│  ← DROP REPORTS INTO THESE FOLDERS ─────────────────────────────────────────
│
├── Reports/
│   ├── ATL/                        Atlanta operations
│   │   ├── Revenue/                Sage Intacct invoice exports (CSV or XLSX)
│   │   ├── FoodCost/               Food & beverage cost reports (CSV or XLSX)
│   │   ├── Labor/                  Payroll reports (CSV or XLSX)
│   │   └── Missions/               Springshot mission exports (CSV)
│   │
│   └── BNA/                        Nashville (when operations begin)
│       ├── Revenue/
│       ├── FoodCost/
│       ├── Labor/
│       └── Missions/
│
│  ← AFTER DROPPING FILES, DOUBLE-CLICK THIS ─────────────────────────────────
│
├── UPDATE_DASHBOARD.bat            ← Double-click to rebuild & push to GitHub
│
│  ← DASHBOARD FILES (don't edit) ────────────────────────────────────────────
│
├── index.html                      Company hub (main entry point)
├── Missions_Operations_Dashboard.html   ATL detail dashboard
├── MissionsSummary_master.csv      ATL missions master data
├── data/
│   └── hub_data.json               Auto-generated — feeds the hub dashboard
│
│  ← AUTOMATION SCRIPTS (don't touch) ────────────────────────────────────────
│
└── automation/
    ├── build_hub_data.py           Reads Reports/ → builds hub_data.json
    ├── merge_new_invoices.py       Merges new invoice CSVs
    └── merge_new_missions.py       Merges new mission CSVs
```

---

## Workflow — adding new data

1. Export your report from Sage Intacct / Springshot
2. Drop the file into the correct `Reports/ATL/` subfolder
3. Double-click **UPDATE_DASHBOARD.bat**
4. Dashboard updates on GitHub Pages within 1–2 minutes

---

## Expected file formats

| Folder | File type | Required columns |
|--------|-----------|-----------------|
| Revenue/ | CSV or XLSX | Airline, Month, Revenue, FoodCost |
| FoodCost/ | CSV or XLSX | Airline, Month, Amount |
| Labor/ | CSV or XLSX | Month, Amount |
| Missions/ | CSV | al_code, on_time, date |

---

## URLs

- **Hub dashboard:** https://abarnhart24.github.io/mainline-aviation-dashboard/
- **ATL detail:** https://abarnhart24.github.io/mainline-aviation-dashboard/Missions_Operations_Dashboard.html
