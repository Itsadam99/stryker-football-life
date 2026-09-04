# Génère l'habillage de l'installateur NSIS aux couleurs de STRYKER.
#
# NSIS (MUI2) impose des BMP non compressés à des dimensions fixes :
#   build/installer-sidebar.bmp    164 x 314   pages Bienvenue et Fin
#   build/installer-header.bmp     150 x  57   bandeau des pages intermédiaires
# Les BMP 32 bits avec canal alpha s'affichent en noir sous NSIS : on écrit
# donc du 24 bits, sur fond opaque.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-installer-art.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$logoPath = Join-Path $root "public/stryker-logo.png"
$outDir = Join-Path $root "build"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Palette du design system (src/styles/stryker-ui.css)
$ink = [System.Drawing.Color]::FromArgb(10, 8, 12)      # --sk-ink
$block = [System.Drawing.Color]::FromArgb(24, 20, 30)
$accent = [System.Drawing.Color]::FromArgb(192, 38, 168) # --sk-accent

$logo = [System.Drawing.Image]::FromFile($logoPath)

function New-Canvas([int]$width, [int]$height) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Draw-Logo($g, [single]$boxX, [single]$boxY, [single]$boxW, [single]$boxH) {
    # Conserve le rapport du logo et le centre dans la boîte donnée.
    $ratio = [single]$logo.Width / [single]$logo.Height
    $w = $boxW
    $h = $w / $ratio
    if ($h -gt $boxH) { $h = $boxH; $w = $h * $ratio }
    $x = $boxX + ($boxW - $w) / 2
    $y = $boxY + ($boxH - $h) / 2
    $g.DrawImage($logo, $x, $y, $w, $h)
}

# ---------------------------------------------------------------- SIDEBAR
$c = New-Canvas 164 314
$g = $c.Graphics

$bgRect = New-Object System.Drawing.Rectangle(0, 0, 164, 314)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $block, $ink, 70.0)
$g.FillRectangle($brush, $bgRect)
$brush.Dispose()

# Halo violet diffus, comme les blocs de l'application
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(-60, 40, 260, 200)
$halo = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
$halo.CenterColor = [System.Drawing.Color]::FromArgb(70, 192, 38, 168)
$halo.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 192, 38, 168))
$g.FillPath($halo, $glow)
$halo.Dispose(); $glow.Dispose()

Draw-Logo $g 12 70 140 110

# Filet d'accent vertical à gauche, signature de la nouvelle direction
$accentBrush = New-Object System.Drawing.SolidBrush($accent)
$g.FillRectangle($accentBrush, 0, 0, 3, 314)

$labelFont = New-Object System.Drawing.Font("Bahnschrift", 8.5, [System.Drawing.FontStyle]::Regular)
$labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 236, 226, 240))
$g.DrawString("MOD MANAGER", $labelFont, $labelBrush, 16, 268)
$g.DrawString("FOOTBALL LIFE", $labelFont, $labelBrush, 16, 284)

$accentBrush.Dispose(); $labelFont.Dispose(); $labelBrush.Dispose()
$c.Bitmap.Save((Join-Path $outDir "installer-sidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $c.Bitmap.Dispose()

# ----------------------------------------------------------------- HEADER
$c = New-Canvas 150 57
$g = $c.Graphics

$hdrRect = New-Object System.Drawing.Rectangle(0, 0, 150, 57)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($hdrRect, $ink, $block, 0.0)
$g.FillRectangle($brush, $hdrRect)
$brush.Dispose()

Draw-Logo $g 8 4 134 40

# Règle d'accent en pied de bandeau
$accentBrush = New-Object System.Drawing.SolidBrush($accent)
$g.FillRectangle($accentBrush, 0, 55, 150, 2)
$accentBrush.Dispose()

$c.Bitmap.Save((Join-Path $outDir "installer-header.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $c.Bitmap.Dispose()

$logo.Dispose()

Get-ChildItem $outDir -Filter "installer-*.bmp" | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    Write-Host ("[STRYKER] {0} : {1}x{2}, {3} octets" -f $_.Name, $img.Width, $img.Height, $_.Length)
    $img.Dispose()
}
