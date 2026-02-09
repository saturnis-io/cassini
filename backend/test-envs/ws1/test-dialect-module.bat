@echo off
echo Running WS-1 Dialect Module unit test suite...
if not defined OPENSPC_TEST_PORT set OPENSPC_TEST_PORT=8099
cd %~dp0\..
python run_tests.py dialect-module
echo.
echo Done.
pause
