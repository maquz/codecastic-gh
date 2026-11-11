# package.ps1 - Builds and packages deploy-cpanel.zip safely
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = $PSScriptRoot

Write-Host "1. Building website bundle..."
Set-Location "$repo\website"
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
}

Write-Host "2. Staging files for cPanel distribution..."
$stage = "$repo\cpanel_stage"
if (Test-Path $stage) {
    Remove-Item -Recurse -Force $stage
}
New-Item -ItemType Directory -Path $stage | Out-Null

# Copy static frontend assets directly to stage root (for LiteSpeed/Apache)
Copy-Item "$repo\website\dist\*" "$stage" -Recurse -Force

# Also copy into stage/dist/ (for Node.js fallback)
New-Item -ItemType Directory -Path "$stage\dist" -Force | Out-Null
Copy-Item "$repo\website\dist\*" "$stage\dist" -Recurse -Force

# Copy PHP backend API, Node app, and configuration
Copy-Item "$repo\website\.htaccess" "$stage\.htaccess" -Force
Copy-Item "$repo\website\api.php" "$stage\api.php" -Force
Copy-Item "$repo\website\app.js" "$stage\app.js" -Force
Copy-Item "$repo\website\package.json" "$stage\package.json" -Force
Copy-Item "$repo\deploy.php" "$stage\deploy.php" -Force

# Copy seed questions & subjects database (SAFE: does not overwrite live candidates)
New-Item -ItemType Directory -Path "$stage\data" -Force | Out-Null
Copy-Item "$repo\website\data\seed.json" "$stage\data\seed.json" -Force

Write-Host "3. Compressing deploy-cpanel.zip..."
$zipPath = "$repo\deploy-cpanel.zip"
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Cleanup stage directory
Remove-Item -Recurse -Force $stage
Set-Location $repo

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Successfully packaged deploy-cpanel.zip ($sizeMb MB)"
