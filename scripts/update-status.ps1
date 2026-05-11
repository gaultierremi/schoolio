# Helper to update agent status in Mission Control
# Usage: .\update-status.ps1 -name "Claudy" -status "working" -task "..."
#        [-branch "..."] [-eta "..."]

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("Claudy", "Coco", "Claudia", "Jules")]
  [string]$name,

  [Parameter(Mandatory=$true)]
  [ValidateSet("working", "planning", "blocked", "idle", "done")]
  [string]$status,

  [Parameter(Mandatory=$false)]
  [string]$task = "",

  [Parameter(Mandatory=$false)]
  [string]$branch = "",

  [Parameter(Mandatory=$false)]
  [string]$eta = ""
)

$body = @{
  name = $name
  status = $status
  current_task = $task
  branch = $branch
  eta = $eta
} | ConvertTo-Json

$token = $env:SCHOOLIO_API_TOKEN
if (-not $token) {
  Write-Host "⚠️ SCHOOLIO_API_TOKEN env var not set, skipping update"
  exit 0  # non-blocking
}

try {
  $response = Invoke-RestMethod `
    -Uri "https://schoolio-two.vercel.app/api/admin/agent-status" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{ Authorization = "Bearer $token" } `
    -Body $body `
    -ErrorAction Stop

  Write-Host "✅ Status updated: $name -> $status"
} catch {
  Write-Host "⚠️ Status update failed (non-blocking): $_"
  exit 0  # non-blocking, on continue même si ça plante
}
