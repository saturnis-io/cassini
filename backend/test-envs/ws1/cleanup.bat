@echo off
echo Cleaning up WS-1 test artifacts...
cd %~dp0\..\..
del /q test_automated.db 2>nul
del /q db_config.json 2>nul
del /q test_server_stderr.log 2>nul
for /f "tokens=*" %%f in ('dir /b openspc_backup_*.db 2^>nul') do del /q "%%f"
echo Done.
pause
