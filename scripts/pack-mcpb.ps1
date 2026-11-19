# Packs dist/mcp.cjs into release/orrery.mcpb (a Claude Desktop extension). Run `npm run build` first.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root "release\orrery.mcpb"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
if (Test-Path $out) { Remove-Item $out }
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($out, "Create")
try {
  # Entry names use "/" so the archive opens the same on every OS.
  $files = @{ "manifest.json" = "mcpb\manifest.json"; "server/mcp.cjs" = "dist\mcp.cjs"; "icon.png" = "assets\icon.png" }
  foreach ($k in $files.Keys) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $root $files[$k]), $k) | Out-Null
  }
} finally { $zip.Dispose() }
Write-Output "Wrote $out"
