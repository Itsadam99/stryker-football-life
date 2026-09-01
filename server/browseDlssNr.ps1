Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "STRYKER - Sélectionnez la DLL DLSSNR épinglée"
$dialog.Filter = "NVIDIA DLSS Neural Rendering (nvngx_dlssnr.dll)|nvngx_dlssnr.dll"
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$top = New-Object System.Windows.Forms.Form
$top.TopMost = $true
if ($dialog.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
} else {
    Write-Output "CANCELLED"
}
