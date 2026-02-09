@echo off
echo Running all WS-1 Multi-Database test suites...
if not defined OPENSPC_TEST_PORT set OPENSPC_TEST_PORT=8099
cd %~dp0\..
python run_tests.py dialect-module database-admin
echo.
echo Done.
pause
