#!/bin/bash
# Wait for SQL Server to start, then create database + login.
# Runs as a background process alongside sqlservr in the container entrypoint.
for i in {1..30}; do
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null && break
  sleep 1
done

# Create database (separate batch — USE in same batch as CREATE fails)
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "
  IF DB_ID('cassini') IS NULL CREATE DATABASE cassini;
"

# Create login with CHECK_POLICY=OFF (login name in password violates policy)
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "
  IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'cassini')
    CREATE LOGIN cassini WITH PASSWORD = '$MSSQL_SA_PASSWORD', CHECK_POLICY = OFF;
"

# Create user and grant db_owner
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "
  USE cassini;
  IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'cassini')
    CREATE USER cassini FOR LOGIN cassini;
  ALTER ROLE db_owner ADD MEMBER cassini;
"
