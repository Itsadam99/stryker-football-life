Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "STRYKER - Sélectionnez une archive de mod ZIP"
$dialog.Filter = "Archives ZIP prises en charge (*.zip)|*.zip"
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
if ($dialog.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
} else {
    Write-Output "CANCELLED"
}

