# ATL Revenue Reports

Drop Sage Intacct invoice export files here (CSV or XLSX).

Expected columns:
  Airline   → airline code (AA, VS, SK, ET)
  Month     → e.g. "Jan 2026"
  Revenue   → total billed amount
  FoodCost  → food & beverage cost (if included in this export)

After dropping files, run:
  python automation/build_hub_data.py
