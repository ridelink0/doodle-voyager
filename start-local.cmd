@echo off
rem Doodle Voyager, local deploy: stage the playable files and serve them.
cd /d "%~dp0"
node tools\stage.mjs
echo Open http://127.0.0.1:5178/ in Chrome or Edge.
node tools\serve.mjs --port 5178 --root dist
