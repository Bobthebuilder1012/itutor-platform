# Requires: Vercel token (Account Settings → Tokens). Scope: Liam Rampersad's projects.
# Usage:
#   $env:VERCEL_TOKEN = "your-token"
#   .\scripts\add-vercel-staging-domain.ps1 -Domain "staging.example.com"
param(
    [Parameter(Mandatory = $true)]
    [string] $Domain,
    [string] $Project = "itutor-platform",
    [string] $TeamSlug = "liam-rampersads-projects",
    [string] $GitBranch = "dev"
)

if (-not $env:VERCEL_TOKEN) {
    Write-Error "Set VERCEL_TOKEN first: `$env:VERCEL_TOKEN = '...'"
    exit 1
}

$uri = "https://api.vercel.com/v10/projects/$Project/domains?slug=$TeamSlug"
$jsonBody = (@{ name = $Domain; gitBranch = $GitBranch } | ConvertTo-Json -Compress)
$headers = @{
    Authorization = "Bearer $($env:VERCEL_TOKEN)"
}

try {
    Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $jsonBody -ContentType 'application/json; charset=utf-8'
} catch {
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
    throw
}
