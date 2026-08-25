$source = "."
$destination = "$HOME\Desktop\AllGO-source.zip"

$excludeDirs = @("node_modules", ".git", ".expo", "dist", "build", ".next", "coverage")
$excludeFiles = @(".env", ".env.local", ".env.production", ".env.development",
                   "serviceAccountKey.json", "*.pem", "*.key", "*.p12", "*.keystore")

$files = Get-ChildItem -Path $source -Recurse -File | Where-Object {
    $path = $_.FullName
    $name = $_.Name
    $dirExcluded = $excludeDirs | Where-Object { $path -like "*\$_\*" }
    $fileExcluded = $excludeFiles | Where-Object { $name -like $_ }
    -not $dirExcluded -and -not $fileExcluded
}

if (Test-Path $destination) { Remove-Item $destination }

Compress-Archive -Path $files.FullName -DestinationPath $destination -CompressionLevel Optimal

Write-Host "Done. Zip created at $destination"
Write-Host "Size: $([math]::Round((Get-Item $destination).Length / 1MB, 2)) MB"
Write-Host "Files included: $($files.Count)"
