# Abre um PDF no Vetra. Chamado pelo "Abrir com" do Explorer (via abrir-pdf.vbs, sem janela preta).
# Como a página do app não pode ler arquivos do disco sozinha, o PDF é copiado para inbox\<id>.js
# e o app o carrega ao abrir. Arquivos antigos da inbox são apagados automaticamente.
param([Parameter(Mandatory = $true)][string]$Arquivo)
$ErrorActionPreference = 'Stop'

$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$inbox = Join-Path (Split-Path -Parent $pasta) 'inbox'   # o app lê inbox\<id>.js ao lado do index.html
New-Item -ItemType Directory -Force $inbox | Out-Null
Get-ChildItem $inbox -Filter *.js -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-30) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

$id = [guid]::NewGuid().ToString('N')
$nome = ([IO.Path]::GetFileName($Arquivo)) | ConvertTo-Json
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Arquivo))
$js = "(window.__LEITOR_INBOX=window.__LEITOR_INBOX||[]).push({name:$nome,b64:`"$b64`"});"
[IO.File]::WriteAllText((Join-Path $inbox "$id.js"), $js, (New-Object System.Text.UTF8Encoding $false))

# abre o app (o lançador também garante o serviço de backup rodando)
& (Join-Path $pasta 'iniciar.ps1') -Abrir $id
