@echo off
rem Local deploy, started at logon by the Startup-folder launcher.
cd /d "%~dp0.."
node tools\stage.mjs > docs\server-run.log 2>&1
node tools\serve.mjs --port 5178 --root dist >> docs\server-run.log 2>&1
