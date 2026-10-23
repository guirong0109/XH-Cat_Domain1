# Runs one forced refresh of "Emerging this week" on the local server, then shows how the items were tagged.
# Run it in a second window:  powershell -ExecutionPolicy Bypass -File .\scripts\refresh-emerging.ps1
$token = Read-Host "Admin token (the same one you gave the server)"
try {
  $result = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/refresh-emerging?force=1" -Headers @{ "x-admin-token" = $token } -TimeoutSec 180
  Write-Host ("Status: " + $result.status)
  Write-Host ("Message: " + $result.message)
} catch {
  Write-Host "Refresh failed:"
  Write-Host $_.ErrorDetails.Message
  Write-Host $_.Exception.Message
  exit 1
}
$data = Invoke-RestMethod http://localhost:3000/api/data
Write-Host ("Tagging: " + $data.emerging.tagging + "  (ai = the model worked, keywords = it did not)")
Write-Host ("Items: " + $data.emerging.items.Count)
