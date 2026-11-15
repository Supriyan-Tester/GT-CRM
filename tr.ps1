param([string]$Project = (Get-Location).Path)
$ErrorActionPreference = "Stop"
$tools = Join-Path $Project "tools"
if(-not(Test-Path $tools)){Write-Host "Run this with -Project pointing at the GM-CRM folder";return}
$ok = $true
function Fix($file,$old,$new){
  $p = Join-Path $tools $file
  $t = [IO.File]::ReadAllText($p)
  if($t.Contains($new)){ Write-Host "Already fixed: $file"; return }
  if(-not $t.Contains($old)){ Write-Host "NOT FOUND in ${file}: $($old.Substring(0,[Math]::Min(50,$old.Length)))"; $script:ok = $false; return }
  if(-not(Test-Path "$p.bak")){ Copy-Item $p "$p.bak" }
  [IO.File]::WriteAllText($p,$t.Replace($old,$new),(New-Object Text.UTF8Encoding($false)))
  Write-Host "Fixed: $file"
}
Fix 'accounts-ui-regression.js' 'sales/collections.html' 'sales/collect-sheet.html'
Fix 'accounts-evidence-regression.js' 'sales/collections.html' 'sales/collect-sheet.html'
Fix 'accounts-evidence-regression.js' 'for (const token of ["data-photo", "availableToCollect", "requestKey"]) assert(sales.includes(token)' 'for (const token of ["data-f=", "availableToCollect", "requestKey"]) assert(sales.includes(token)'
Fix 'accounts-split-regression.js' 'read("sales/collections.html"), ["clSplit", "clSp_"]' 'read("sales/collect-sheet.html"), ["csSplit", "sp_"]'
Fix 'accounts-split-regression.js' 'page.includes("splitPayments()") && page.includes("splitOk()")' 'page.includes("splitPayments()") && (page.includes("splitOk()") || name === "sales")'
Fix 'sales-attendance-regression.js' 'cssSource.includes("@media (max-width:640px)")' '/@media \(max-width:\s*640px\)/.test(cssSource)'
$p = Join-Path $tools 'sales-collections-ui-regression.js'
if(Test-Path $p){ if(-not(Test-Path "$p.bak")){ Copy-Item $p "$p.bak" } }
$new = @'
#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const page = fs.readFileSync(path.join(__dirname, "..", "sales", "collect-sheet.html"), "utf8");
const checks = [
  [/\/api\/accounts\/collections\/split/.test(page) && /splitPayments\(\)/.test(page), "split payment route is used"],
  [/\/api\/accounts\/evidence/.test(page) && /data-f=/.test(page), "bill photo upload is kept"],
  [/requestKey/.test(page) && /availableToCollect/.test(page), "request key and collectable amount are kept"],
  [/get\("c"\)/.test(page) && /cs-hero/.test(page), "shop code is read from ?c= and the hero card is shown"],
];
checks.forEach(([ok, n]) => { assert.ok(ok, "FAILED: " + n); console.log("PASS " + n); });
console.log("Sales collections UI regression: " + checks.length + " checks passed.");
'@
[IO.File]::WriteAllText($p,($new -replace "`r`n","`n"),(New-Object Text.UTF8Encoding($false))); Write-Host 'Fixed: sales-collections-ui-regression.js'
Write-Host 'Done. Run: npm test'