@echo off
echo Running WS-1 Database Admin API test suite...
if not defined OPENSPC_TEST_PORT set OPENSPC_TEST_PORT=8099
cd %~dp0\..
python run_tests.py database-admin
echo.
echo Done.
pause
