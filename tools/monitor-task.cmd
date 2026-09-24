@echo off
rem Daily health check, started by the "DoodleVoyager Monitor" scheduled task.
cd /d "%~dp0.."
echo ==== %DATE% %TIME% >> docs\monitor-run.log
node tools\monitor.mjs >> docs\monitor-run.log 2>&1
node tools\monitor.mjs --url https://doodle-voyager.vercel.app/ >> docs\monitor-run.log 2>&1
