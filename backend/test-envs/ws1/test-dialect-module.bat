@echo off
echo Running WS-1 Dialect Module unit test suite...
if not defined CASSINI_TEST_PORT set CASSINI_TEST_PORT=8099
cd %~dp0\..
python run_tests.py dialect-module
echo.
echo Done.
pause
