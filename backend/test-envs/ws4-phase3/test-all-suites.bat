@echo off
echo Running all test suites...
cd %~dp0\..
python run_tests.py
echo.
echo Done.
pause
