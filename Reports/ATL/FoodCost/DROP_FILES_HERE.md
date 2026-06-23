# ATL Food Cost Reports

Drop food & beverage cost exports here (CSV or XLSX).
Only needed if food cost is NOT already included in your Revenue export.

Expected columns:
  Airline   → airline code (AA, VS, SK, ET)
  Month     → e.g. "Jan 2026"
  Amount    → food cost for that month

After dropping files, run:
  python automation/build_hub_data.py
