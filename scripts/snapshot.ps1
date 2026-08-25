$output = "$HOME\Desktop\AllGO-project-state.txt"
"=== FOLDER STRUCTURE ===" | Out-File $output

Get-ChildItem -Recurse -Directory -Exclude node_modules,.git,.expo,dist,build,.next |
  Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*\.git*" } |
  ForEach-Object { $_.FullName.Replace((Get-Location).Path, "") } |
  Out-File $output -Append

"`n=== TOP-LEVEL FILES ===" | Out-File $output -Append
Get-ChildItem -File | Select-Object Name | Out-File $output -Append

"`n=== package.json (root) ===" | Out-File $output -Append
Get-Content package.json -ErrorAction SilentlyContinue | Out-File $output -Append

Get-ChildItem -Recurse -Filter "package.json" -Exclude node_modules |
  Where-Object { $_.FullName -notlike "*node_modules*" } |
  ForEach-Object {
    "`n=== $($_.FullName.Replace((Get-Location).Path, '')) ===" | Out-File $output -Append
    Get-Content $_.FullName | Out-File $output -Append
  }

Get-ChildItem -Recurse -Filter "schema.prisma" |
  ForEach-Object {
    "`n=== $($_.FullName.Replace((Get-Location).Path, '')) ===" | Out-File $output -Append
    Get-Content $_.FullName | Out-File $output -Append
  }

Write-Host "Done. Written to $output"
