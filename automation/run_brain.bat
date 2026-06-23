@echo off
echo ================================================
echo   Mainline Aviation — Brain / Data Center
echo ================================================
echo.
echo Reading all reports from Reports/ folders...
echo.

cd /d "%~dp0.."
python automation\build_hub_data.py

echo.
echo ================================================
echo  Committing and pushing to GitHub...
echo ================================================
echo.

git add data\hub_data.json
git commit -m "Update hub data from reports"
git push origin main

echo.
echo Done! Dashboard will update in 1-2 minutes.
echo.
pause
