# Instala o Vetra para o seu usuário (não precisa de administrador):
#  - atalho "Vetra" na Área de Trabalho e no menu Iniciar
#  - "Abrir com → Vetra" para arquivos .pdf
#  - serviço de backup automático, que inicia junto com o Windows
#    (grava em Documentos\Leitor de Estudos\Backups: um arquivo por dia, últimos 30 dias)
# O app abre numa janela própria do Edge (ou Chrome), sem barra de endereço, com um perfil separado. Tudo offline.
param(
  [string[]]$Destinos = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')),
  [switch]$NaoAbrir,
  [switch]$SemAssociacao,
  [switch]$SemServico
)
$ErrorActionPreference = 'Stop'

$pasta  = Split-Path -Parent $MyInvocation.MyCommand.Path
$icone  = Join-Path $pasta 'vetra.ico'
$raiz  = Split-Path -Parent $pasta   # os scripts ficam em Vetra\windows; o app, em Vetra
if (-not (Test-Path (Join-Path $raiz 'index.html'))) { throw "Não encontrei o index.html em $raiz" }
$shell = New-Object -ComObject WScript.Shell

# Atalhos: passam pelo lançador, que garante o serviço de backup antes de abrir o app
foreach ($destino in $Destinos) {
  Remove-Item (Join-Path $destino 'Leitor de Estudos.lnk') -Force -ErrorAction SilentlyContinue # nome antigo
  $lnk = $shell.CreateShortcut((Join-Path $destino 'Vetra (testes).lnk')) # "Vetra" é o app instalado
  $lnk.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments        = "`"$(Join-Path $pasta 'iniciar.vbs')`""
  $lnk.IconLocation     = "$icone,0"
  $lnk.WorkingDirectory = $pasta
  $lnk.Description      = 'Vetra (versão de testes)'
  $lnk.Save()
}

# Serviço de backup: inicia com o Windows e já começa agora
if (-not $SemServico) {
  $inicializar = [Environment]::GetFolderPath('Startup')
  Remove-Item (Join-Path $inicializar 'Leitor de Estudos - backup.lnk') -Force -ErrorAction SilentlyContinue # nome antigo
  $lnk = $shell.CreateShortcut((Join-Path $inicializar 'Vetra - backup.lnk'))
  $lnk.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments        = "`"$(Join-Path $pasta 'servico-backup.vbs')`""
  $lnk.WorkingDirectory = $pasta
  $lnk.Description      = 'Backup automático do Vetra'
  $lnk.Save()
  # reinicia o serviço para usar a versão desta pasta
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*servico-backup.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $pasta 'servico-backup.ps1')`"")
}

# "Abrir com → Vetra" para arquivos .pdf
if (-not $SemAssociacao) {
  $vbs    = Join-Path $pasta 'abrir-pdf.vbs'
  $raiz   = 'HKCU:\Software\Classes'
  $progId = 'LeitorDeEstudos.pdf'
  function Garantir($caminho) { if (-not (Test-Path $caminho)) { New-Item -Path $caminho -Force | Out-Null } }
  Garantir "$raiz\$progId\shell\open\command"
  Garantir "$raiz\$progId\DefaultIcon"
  Garantir "$raiz\$progId\Application"
  Set-Item -Path "$raiz\$progId" -Value 'Documento PDF (Vetra testes)'
  Set-Item -Path "$raiz\$progId\DefaultIcon" -Value "$icone,0"
  Set-Item -Path "$raiz\$progId\shell\open\command" -Value "wscript.exe `"$vbs`" `"%1`""
  New-ItemProperty -Path "$raiz\$progId\shell\open" -Name 'FriendlyAppName' -Value 'Vetra (testes)' -Force | Out-Null
  New-ItemProperty -Path "$raiz\$progId\Application" -Name 'ApplicationName' -Value 'Vetra (testes)' -Force | Out-Null
  New-ItemProperty -Path "$raiz\$progId\Application" -Name 'ApplicationIcon' -Value "$icone,0" -Force | Out-Null
  Garantir "$raiz\.pdf\OpenWithProgids"
  New-ItemProperty -Path "$raiz\.pdf\OpenWithProgids" -Name $progId -Value ([byte[]]@()) -PropertyType None -Force | Out-Null
  Add-Type -Namespace Win32 -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, System.IntPtr a, System.IntPtr b);'
  [Win32.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}

if (-not $NaoAbrir) {
  $docs = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Leitor de Estudos\Backups'
  [void]$shell.Popup("Pronto! O 'Vetra' está instalado.`n`n• Atalho na Área de Trabalho e no menu Iniciar.`n• Backup automático ligado: uma cópia por dia dos seus grifos e notas em`n   $docs`n   (guarda os últimos 30 dias).`n• Para abrir PDFs com dois cliques: botão direito num PDF > Abrir com > Escolher outro aplicativo > Vetra > Sempre.`n`nDica: para fixar na barra de tarefas, use o botão direito no atalho da Área de Trabalho > Mostrar mais opções > Fixar na barra de tarefas.", 0, 'Vetra', 64)
  & (Join-Path $pasta 'iniciar.ps1')
}
