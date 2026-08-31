param(
  [Parameter(Mandatory = $true)]
  [string]$Executable,

  [Parameter(Mandatory = $true)]
  [string]$WorkingDirectory
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
  throw "Executable introuvable."
}

if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) {
  throw "Dossier de lancement introuvable."
}

$resolvedExecutable = (Resolve-Path -LiteralPath $Executable).Path
$resolvedWorkingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
$launched = Start-Process -FilePath $resolvedExecutable -WorkingDirectory $resolvedWorkingDirectory -PassThru
[Console]::Out.Write($launched.Id)
