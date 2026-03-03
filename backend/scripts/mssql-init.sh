#!/bin/bash
# Wait for SQL Server to start, then create database + login
for i in {1..30}; do
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null && break
  sleep 1
done

/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "
  IF DB_ID('cassini') IS NULL CREATE DATABASE cassini;
  IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'cassini')
    CREATE LOGIN cassini WITH PASSWORD = 'Cassini#Test1';
  USE cassini;
  IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'cassini')
    CREATE USER cassini FOR LOGIN cassini;
  ALTER ROLE db_owner ADD MEMBER cassini;
"
