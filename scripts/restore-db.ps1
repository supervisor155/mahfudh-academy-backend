param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
  throw "pg_restore command not found. Install PostgreSQL client tools and ensure pg_restore is in PATH."
}

$databaseUrl = if ($env:DB_URL) { $env:DB_URL } elseif ($env:DATABASE_URL) { $env:DATABASE_URL } else { throw "DB_URL (or DATABASE_URL) is not set." }

Write-Host "Restoring backup from: $BackupFile"
& pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$databaseUrl" "$BackupFile"

Write-Host "Restore completed from: $BackupFile"
