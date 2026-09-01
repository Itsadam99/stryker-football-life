param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,
  [Parameter(Mandatory = $true)]
  [string]$OutputArchive
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory)
$outputPath = [System.IO.Path]::GetFullPath($OutputArchive)
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "artifacts"))

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
  throw "Le dossier source du Facepack est introuvable."
}
if (-not $outputPath.StartsWith($artifactRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "L'archive de sortie doit rester dans le dossier artifacts du projet."
}
if (Test-Path -LiteralPath $outputPath) {
  throw "L'archive de sortie existe déjà. Choisissez un nouveau nom."
}

$stage = Join-Path $artifactRoot ("facepack-stage-" + [Guid]::NewGuid().ToString("N"))
$facesTarget = Join-Path $stage "livecpk\MEGA_FACEPACK_V2\Asset\model\character\face\real"
New-Item -ItemType Directory -Path $facesTarget -Force | Out-Null

try {
  $playerDirectories = Get-ChildItem -LiteralPath $sourceRoot -Directory
  foreach ($playerDirectory in $playerDirectories) {
    $winDirectory = Join-Path $playerDirectory.FullName "#Win"
    if (-not (Test-Path -LiteralPath $winDirectory -PathType Container)) { continue }
    $playerTarget = Join-Path $facesTarget $playerDirectory.Name
    New-Item -ItemType Directory -Path $playerTarget -Force | Out-Null
    Copy-Item -LiteralPath $winDirectory -Destination $playerTarget -Recurse
  }

  $blockedExtensions = @(".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs", ".py", ".pyw", ".js", ".jse", ".wsf", ".wsh", ".hta", ".scr", ".jar", ".lnk", ".reg", ".sh", ".cpl", ".pif")
  Get-ChildItem -LiteralPath $facesTarget -Recurse -File |
    Where-Object { $blockedExtensions -contains $_.Extension.ToLowerInvariant() } |
    Remove-Item -Force

  Copy-Item -LiteralPath (Join-Path $projectRoot "mod-packages\mega-facepack-v2\stryker.mod.json") -Destination (Join-Path $stage "stryker.mod.json")
  $packRoot = Split-Path -Parent $sourceRoot
  foreach ($name in @("Faces.txt", "Creditos.txt")) {
    $metadataPath = Join-Path $packRoot $name
    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
      Copy-Item -LiteralPath $metadataPath -Destination (Join-Path $stage $name)
    }
  }

  $outputDirectory = Split-Path -Parent $outputPath
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  tar -a -c -f $outputPath -C $stage Creditos.txt Faces.txt livecpk stryker.mod.json
  if ($LASTEXITCODE -ne 0) { throw "La création de l'archive a échoué." }

  $file = Get-Item -LiteralPath $outputPath
  $hash = Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
  [pscustomobject]@{
    Archive = $file.FullName
    Size = $file.Length
    Sha256 = $hash.Hash.ToLowerInvariant()
    Players = (Get-ChildItem -LiteralPath $facesTarget -Directory).Count
  }
}
finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
