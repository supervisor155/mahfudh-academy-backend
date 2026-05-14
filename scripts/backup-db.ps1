param(
  [string]$OutputDir = "./backups",
  [string]$FilePrefix = "quran"
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump command not found. Install PostgreSQL client tools and ensure pg_dump is in PATH."
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutputDir "$FilePrefix-$timestamp.dump"

$databaseUrl = if ($env:DB_URL) { $env:DB_URL } elseif ($env:DATABASE_URL) { $env:DATABASE_URL } else { throw "DB_URL (or DATABASE_URL) is not set." }

Write-Host "Creating backup: $outFile"
& pg_dump --format=custom --no-owner --no-privileges --file="$outFile" "$databaseUrl"

Write-Host "Backup completed: $outFile"
