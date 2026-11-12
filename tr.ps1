param([Parameter(Mandatory=$true)][string]$Project)
# Applies the form-validation edits to your GM-CRM folder. Makes a .bak copy of every file it changes.
$utf8=New-Object System.Text.UTF8Encoding($false)
function D($s){[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s))}
function Count($t,$x){$c=0;$i=0;while(($i=$t.IndexOf($x,$i,[StringComparison]::Ordinal)) -ge 0){$c++;$i+=$x.Length};$c}
function Patch($rel,$pairs){
  $p=Join-Path $Project $rel
  if(-not (Test-Path $p)){Write-Host "MISSING  $rel" -ForegroundColor Red;return}
  $t=[IO.File]::ReadAllText($p,$utf8)
  if((($t.Contains("<small>Next</small>")))){Write-Host "SKIPPED  $rel (already updated)" -ForegroundColor Yellow;return}
  $crlf=$t.Contains("`r`n"); $new=$t
  foreach($pr in $pairs){
    $o=D $pr[0];$n=D $pr[1]
    if($crlf){$o=$o.Replace("`n","`r`n");$n=$n.Replace("`n","`r`n")}
    if((Count $new $o) -ne 1){Write-Host "FAILED   $rel (a part of the file is different from my copy, nothing changed)" -ForegroundColor Red;return}
    $new=$new.Replace($o,$n)
  }
  Copy-Item $p "$p.bak" -Force
  [IO.File]::WriteAllText($p,$new,$utf8)
  Write-Host "UPDATED  $rel" -ForegroundColor Green
}

Patch "admin\collections.html" @(
  @("ICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPSJjby1uZXh0Ij48c21hbGw+V2hhdCBoYXBwZW5zIG5vdzwvc21hbGw+PHVsPicgKwogICAgICAgICAgICAgICAgIjxsaT5UaGUgY3VzdG9tZXIgYmFsYW5jZSBpcyA8Yj5ub3Q8L2I+IHJlZHVjZWQuIFRoZSBpbnZvaWNlIHN0aWxsIHNob3dzIHdoYXQgaXQgc2hvd2VkIGJlZm9yZS48L2xpPiIgKwogICAgICAgICAgICAgICAgIjxsaT5UaGUgIiArIG1vbmV5KHgudG90YWxfYW1vdW50KSArICIgdGhhdCAiICsgZXNjKHguY29sbGVjdG9yX25hbWVfc25hcHNob3QpICsgIiByZWNvcmRlZCBpcyA8Yj5zdGlsbCBjb3VudGVkPC9iPiBhcyBtb25leSB0aGV5IGhvbGQuIEl0IGlzIG5vdCBsb3N0LjwvbGk+IiArCiAgICAgICAgICAgICAgICAiPGxpPlRoZSBvZmZpY2UgaGFzIHRvIHNldHRsZSB0aGlzIG1vbmV5IHdpdGggIiArIGVzYyh4LmNvbGxlY3Rvcl9uYW1lX3NuYXBzaG90KSArICIgZGlyZWN0bHkgKGhhbmQgaXQgYmFjaywgb3IgY29sbGVjdCBpdCBhZ2FpbiBjb3JyZWN0bHkpLiBUaGUgYXBwIGRvZXMgbm90IG1vdmUgaXQgYnkgaXRzZWxmLjwvbGk+PC91bD48L2Rpdj48L2Rpdj4i","ICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPSJjby1uZXh0Ij48c21hbGw+TmV4dDwvc21hbGw+PHVsPicgKwogICAgICAgICAgICAgICAgIjxsaT5DdXN0b21lciBiYWxhbmNlIGlzIDxiPm5vdDwvYj4gcmVkdWNlZC48L2xpPiIgKwogICAgICAgICAgICAgICAgIjxsaT4iICsgZXNjKHguY29sbGVjdG9yX25hbWVfc25hcHNob3QpICsgIiBzdGlsbCBob2xkcyB0aGUgIiArIG1vbmV5KHgudG90YWxfYW1vdW50KSArICIuIFNldHRsZSBpdCB3aXRoIHRoZW0uPC9saT48L3VsPjwvZGl2PjwvZGl2PiI="),
  @("ICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPSJjby1uZXh0Ij48c21hbGw+V2hhdCBoYXBwZW5zIG5vdzwvc21hbGw+PHVsPicgKwogICAgICAgICAgICAgICAgIjxsaT4iICsgZXNjKHguY29sbGVjdG9yX25hbWVfc25hcHNob3QpICsgIiByZWNvcmRzIGEgbmV3IGNvbGxlY3Rpb24gd2l0aCB0aGUgZml4LiBUaGlzIG9uZSBzdGF5cyBvbiByZWNvcmQuPC9saT4iICsKICAgICAgICAgICAgICAgICI8bGk+VGhlIG1vbmV5IHJlY29yZGVkIGZvciB0aGlzIG9uZSBpcyBzdGlsbCBjb3VudGVkIGFzIG1vbmV5IHRoZXkgaG9sZCB1bnRpbCB0aGUgb2ZmaWNlIHNldHRsZXMgaXQuPC9saT48L3VsPjwvZGl2PjwvZGl2PiI=","ICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPSJjby1uZXh0Ij48c21hbGw+TmV4dDwvc21hbGw+PHVsPicgKwogICAgICAgICAgICAgICAgIjxsaT4iICsgZXNjKHguY29sbGVjdG9yX25hbWVfc25hcHNob3QpICsgIiByZWNvcmRzIGEgbmV3IGNvbGxlY3Rpb24gd2l0aCB0aGUgZml4LjwvbGk+IiArCiAgICAgICAgICAgICAgICAiPGxpPlRoaXMgb25lIHN0YXlzIG9uIHJlY29yZC48L2xpPjwvdWw+PC9kaXY+PC9kaXY+Ig==")
)
Write-Host "Done. Refresh the page with Ctrl+F5."