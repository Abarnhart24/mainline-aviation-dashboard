# Mainline Aviation BI Dashboard

Automated flight cost tracking and profitability dashboard for Mainline Aviation catering operations.

## Airlines Tracked
- **SAS** (SK0930 ATL→CPH) — Jan–Jun 2026
- **Ethiopian Airlines** — Active
- **American Airlines** — Coming soon
- **Virgin Atlantic** — Coming soon

## Architecture

```
SharePoint (team file uploads)
       │
       ▼ Power Automate webhook
GitHub Actions (pipeline)
       │  ├── OCR: extract pax counts from delivery note PDFs
       │  ├── Rebuild Excel cost trackers
       │  └── Generate dashboard JSON data
       ▼
AWS S3 + CloudFront (web dashboard)
       │
       ▼
Browser dashboard — charts, tables, profit/cost/revenue by flight
```

## Repo Structure

```
├── .github/workflows/       GitHub Actions (pipeline + deploy)
├── pipeline/
│   ├── ocr/                 PDF → pax count extraction
│   └── trackers/            Excel tracker builders + JSON export
├── dashboard/               Static web app (HTML/JS/CSS)
├── data/                    Generated JSON (updated by pipeline)
├── terraform/               AWS infrastructure as code
└── docs/SETUP.md            Full setup instructions
```

## Quick Start

See [docs/SETUP.md](docs/SETUP.md) for full instructions including:
- Pushing this repo to GitHub
- Deploying to AWS
- Connecting SharePoint via Power Automate
- Configuring GitHub Secrets

## Local Development

```bash
# Install Python dependencies
pip install -r pipeline/requirements.txt

# Run OCR on a delivery note PDF
python pipeline/ocr/extract_pax.py --pdf "path/to/delivery_note.pdf"

# Rebuild a tracker
python pipeline/trackers/build_sas_tracker.py

# Export dashboard data
python pipeline/trackers/generate_dashboard_data.py
```
