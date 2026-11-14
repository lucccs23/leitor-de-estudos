# Remove os atalhos, o "Abrir com" e o serviço de backup do Vetra.
# Seus grifos NÃO são apagados (ficam em %LOCALAPPDATA%\LeitorDeEstudos), nem os backups em Documentos\Leitor de Estudos.
$ErrorActionPreference = 'SilentlyContinue'
foreach ($destino in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $destino 'Vetra (testes).lnk') -Force # o "Vetra.lnk" é do app instalado: fica
  Remove-Item (Join-Path $destino 'Leitor de Estudos.lnk') -Force
}
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Vetra - backup.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Leitor de Estudos - backup.lnk') -Force
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*servico-backup.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item 'HKCU:\Software\Classes\LeitorDeEstudos.pdf' -Recurse -Force
Remove-ItemProperty -Path 'HKCU:\Software\Classes\.pdf\OpenWithProgids' -Name 'LeitorDeEstudos.pdf' -Force
$shell = New-Object -ComObject WScript.Shell
[void]$shell.Popup("Atalhos, 'Abrir com' e backup automático removidos.`nSeus grifos e os backups já feitos continuam guardados.", 0, 'Vetra', 64)
