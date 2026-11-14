$f = Join-Path (Get-Location) 'admin\statement.html'
if(-not(Test-Path $f)){Write-Host 'Run this inside the GM-CRM folder';exit 1}
Copy-Item $f "$f.bak" -Force
$t = [IO.File]::ReadAllText($f) -replace "`r`n","`n"
$a = @'
<button type="button" class="btn a-btn" id="stLoad" data-act>Show</button>
'@
$b = @'
<button type="button" class="btn a-btn" id="stLoad">Show</button>
'@
if($t.Contains($b)){ Write-Host 'Already applied.'; exit 0 }
if(-not $t.Contains($a)){ Write-Host 'Could not find the Show button. Send me admin\statement.html.'; exit 1 }
$t = $t.Replace($a,$b)
[IO.File]::WriteAllText($f,$t,(New-Object Text.UTF8Encoding($false)))
Write-Host 'Done. Paste the CSS file at the bottom of shared\admin.css, then Ctrl+F5.'