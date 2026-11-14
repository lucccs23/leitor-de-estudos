# Abre o Vetra numa janela própria do Edge (ou Chrome) e garante que o serviço de backup está rodando.
# Usado pelo atalho (via iniciar.vbs, sem janela preta) e pelo "Abrir com" (abrir-pdf.ps1).
param([string]$Abrir = '')
$ErrorActionPreference = 'Stop'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path   # Vetra\windows
$raiz  = Split-Path -Parent $pasta                          # Vetra (o app)
$porta = 47613
$dados = Join-Path $env:LOCALAPPDATA 'LeitorDeEstudos'
$tokenFile = Join-Path $dados 'backup-token.txt'

function ServicoAtivo {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $porta); return $true } catch { return $false } finally { $c.Dispose() }
}
if (-not (ServicoAtivo)) {
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $pasta 'servico-backup.ps1')`"")
  for ($i = 0; $i -lt 30 -and -not (Test-Path $tokenFile); $i++) { Start-Sleep -Milliseconds 100 }
}
$token = if (Test-Path $tokenFile) { ([IO.File]::ReadAllText($tokenFile)).Trim() } else { '' }

$candidatos = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$navegador = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) { throw 'Não encontrei o Microsoft Edge nem o Google Chrome.' }
$perfil = Join-Path $dados 'perfil'

$params = @()
if ($token) { $params += "bk=$token" }
if ($Abrir) { $params += "abrir=$Abrir" }
$url = ([System.Uri](Join-Path $raiz 'index.html')).AbsoluteUri
if ($params.Count) { $url += '?' + ($params -join '&') }
Start-Process -FilePath $navegador -ArgumentList "--app=`"$url`" --user-data-dir=`"$perfil`" --no-first-run --no-default-browser-check"
