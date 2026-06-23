# ATL Missions Reports

Drop Springshot mission export files here (CSV).
The master file (MissionsSummary_master.csv) in the root is read automatically.
Drop NEW monthly exports here — they will be merged in.

Expected columns (same as Springshot export):
  al_code, on_time, date, etc.

After dropping files, run:
  python automation/build_hub_data.py
