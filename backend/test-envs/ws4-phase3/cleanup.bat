@echo off
cd %~dp0\..\..
del /q test_automated.db 2>nul
del /q test_automated_negauth.db 2>nul
del /q test_structlog.db 2>nul
del /q test_server_stderr.log 2>nul
echo Cleanup complete.
