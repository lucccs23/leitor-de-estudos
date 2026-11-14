# Serviço local de backup do Vetra.
# Fica rodando escondido e recebe do leitor (só dele: exige uma senha interna) uma cópia dos grifos,
# notas, marcadores e tempo de estudo. Grava em Documentos\Leitor de Estudos\Backups:
#   leitor-backup-AAAA-MM-DD.json  (um por dia, mantém os últimos 30)
#   ultimo-backup.json             (sempre o mais recente)
# Também faz OCR (reconhecer texto de PDFs escaneados) com o motor nativo do Windows, offline.
# Só escuta em 127.0.0.1 (não aceita conexões de outros computadores).
param([int]$Porta = 47613, [string]$Destino = '', [int]$Manter = 30)
$ErrorActionPreference = 'Stop'

$dados = Join-Path $env:LOCALAPPDATA 'LeitorDeEstudos'
New-Item -ItemType Directory -Force $dados | Out-Null
$tokenFile = Join-Path $dados 'backup-token.txt'
if (-not (Test-Path $tokenFile)) {
  [IO.File]::WriteAllText($tokenFile, [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
}
$token = ([IO.File]::ReadAllText($tokenFile)).Trim()
if (-not $Destino) { $Destino = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Leitor de Estudos\Backups' }
New-Item -ItemType Directory -Force $Destino | Out-Null

try {
  $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, $Porta)
  $listener.Start()
} catch { exit 0 }  # a porta já está em uso: o serviço já está rodando

$utf8 = New-Object System.Text.UTF8Encoding $false
$limite = 200MB

function Responder($stream, [int]$codigo, [string]$corpo) {
  $textos = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 413 = 'Payload Too Large'; 500 = 'Internal Server Error' }
  $b = $utf8.GetBytes($corpo)
  $h = "HTTP/1.1 $codigo $($textos[$codigo])`r`n" +
       "Content-Type: application/json; charset=utf-8`r`n" +
       "Access-Control-Allow-Origin: *`r`n" +
       "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
       "Access-Control-Allow-Headers: *`r`n" +
       "Access-Control-Allow-Private-Network: true`r`n" +
       "Cache-Control: no-store`r`n" +
       "Content-Length: $($b.Length)`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($h)
  $stream.Write($hb, 0, $hb.Length)
  if ($b.Length) { $stream.Write($b, 0, $b.Length) }
  $stream.Flush()
}
function Json($obj) { $obj | ConvertTo-Json -Compress }
# Abre um link no Chrome (ou no navegador padrão do Windows) (o app roda numa janela própria do Edge).
# Só sites conhecidos (IA e GitHub), para o serviço não virar um "abridor" de qualquer coisa.
$sitesPermitidos = '^https://(claude\.ai|chatgpt\.com|gemini\.google\.com|github\.com)(/|$)'
function NavegadorPadrao {
  # preferência: Google Chrome (onde você está logado no Claude/ChatGPT/Gemini); sem Chrome, o navegador padrão
  foreach ($c in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")) {
    if (Test-Path $c) { return $c }
  }
  try {
    $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction Stop).ProgId
    $cmd = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command" -ErrorAction Stop).'(default)'
    if ($cmd -match '^\s*"([^"]+\.exe)"' -or $cmd -match '^\s*(\S+\.exe)') { if (Test-Path $Matches[1]) { return $Matches[1] } }
  } catch {}
  return $null
}
function AbrirLink([string]$url) {
  if ($url -notmatch $sitesPermitidos -or $url -match '["\s<>]' -or $url.Length -gt 30000) { return $false }
  $exe = NavegadorPadrao
  # passa o link direto ao navegador (links longos da IA não são cortados); sem achar, deixa o Windows escolher
  if ($exe) { Start-Process -FilePath $exe -ArgumentList "`"$url`"" } else { Start-Process $url }
  return $true
}
function Status() {
  $arqs = @(Get-ChildItem $Destino -Filter 'leitor-backup-*.json' -ErrorAction SilentlyContinue)
  $ultimo = Get-Item (Join-Path $Destino 'ultimo-backup.json') -ErrorAction SilentlyContinue
  Json @{ ok = $true; pasta = $Destino; arquivos = $arqs.Count; ultimo = $(if ($ultimo) { $ultimo.LastWriteTime.ToString('o') } else { $null }) }
}

# ---------- OCR nativo do Windows (reconhecer texto de páginas escaneadas) ----------
# Recebe a imagem de uma página (PNG/JPEG) e devolve as palavras com suas posições em pixels.
$script:motor = $null
$inv = [Globalization.CultureInfo]::InvariantCulture
function IniciarOcr {
  if ($script:motor) { return }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $pt = New-Object Windows.Globalization.Language 'pt-BR'
  $script:motor = if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($pt)) { [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($pt) }
                  else { [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
}
function Aguardar($op, [Type]$tipo) { $task = $script:asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function Texto($s) { '"' + (($s -replace '\\', '\\') -replace '"', '\"' -replace '[\x00-\x1f]', ' ') + '"' }
function Num($v) { $v.ToString('0.#', $inv) }
function Ocr([byte[]]$bytes) {
  IniciarOcr
  if (-not $script:motor) { return (Json @{ ok = $false; erro = 'O Windows não tem um idioma de OCR instalado.' }) }
  $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream((New-Object System.IO.MemoryStream (, $bytes)))
  $decoder = Aguardar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Aguardar ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Aguardar ($script:motor.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $linhasJson = foreach ($l in $res.Lines) {
    $ps = foreach ($w in $l.Words) { $r = $w.BoundingRect; '[' + (Texto $w.Text) + ',' + (Num $r.X) + ',' + (Num $r.Y) + ',' + (Num $r.Width) + ',' + (Num $r.Height) + ']' }
    '[' + ($ps -join ',') + ']'
  }
  $ang = if ($res.TextAngle) { Num $res.TextAngle.Value } else { '0' }
  '{"ok":true,"lang":' + (Texto $script:motor.RecognizerLanguage.LanguageTag) + ',"w":' + $bitmap.PixelWidth + ',"h":' + $bitmap.PixelHeight + ',"angle":' + $ang + ',"lines":[' + ($linhasJson -join ',') + ']}'
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 15000; $client.SendTimeout = 15000
    $s = $client.GetStream()
    $buf = New-Object byte[] 65536
    $ms = New-Object System.IO.MemoryStream
    $fimCab = -1; $texto = ''
    while ($fimCab -lt 0) {
      $n = $s.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $ms.Write($buf, 0, $n)
      $texto = [Text.Encoding]::ASCII.GetString($ms.ToArray())
      $fimCab = $texto.IndexOf("`r`n`r`n")
      if ($fimCab -lt 0 -and $ms.Length -gt 65536) { break }
    }
    if ($fimCab -lt 0) { continue }

    $linhas = $texto.Substring(0, $fimCab) -split "`r`n"
    $partes = $linhas[0] -split ' '
    $metodo = $partes[0]; $alvo = $partes[1]
    $caminho = ($alvo -split '\?')[0]
    $consulta = if ($alvo.Contains('?')) { ($alvo -split '\?', 2)[1] } else { '' }
    $t = ''
    foreach ($par in $consulta -split '&') { if ($par.StartsWith('t=')) { $t = $par.Substring(2) } }
    $tamanho = 0
    foreach ($l in $linhas) { if ($l -match '^(?i)content-length:\s*(\d+)') { $tamanho = [int64]$Matches[1] } }

    if ($metodo -eq 'OPTIONS') { Responder $s 204 ''; continue }
    if ($t -ne $token) { Responder $s 403 (Json @{ ok = $false; erro = 'senha' }); continue }

    if ($metodo -eq 'GET' -and $caminho -eq '/status') { Responder $s 200 (Status); continue }

    if ($metodo -eq 'POST' -and ($caminho -eq '/backup' -or $caminho -eq '/ocr' -or $caminho -eq '/abrir')) {
      if ($tamanho -le 0 -or $tamanho -gt $limite) { Responder $s 413 (Json @{ ok = $false; erro = 'tamanho' }); continue }
      $todos = $ms.ToArray()
      $corpo = New-Object System.IO.MemoryStream
      $corpo.Write($todos, $fimCab + 4, $todos.Length - ($fimCab + 4))
      while ($corpo.Length -lt $tamanho) {
        $n = $s.Read($buf, 0, $buf.Length)
        if ($n -le 0) { break }
        $corpo.Write($buf, 0, $n)
      }
      if ($corpo.Length -lt $tamanho) { Responder $s 400 (Json @{ ok = $false; erro = 'incompleto' }); continue }
      $bytes = $corpo.ToArray()
      if ($caminho -eq '/ocr') { Responder $s 200 (Ocr $bytes); continue }
      if ($caminho -eq '/abrir') {
        if (AbrirLink ($utf8.GetString($bytes).Trim())) { Responder $s 200 (Json @{ ok = $true }) } else { Responder $s 400 (Json @{ ok = $false; erro = 'link' }) }
        continue
      }
      $inicio = $utf8.GetString($bytes, 0, [Math]::Min(200, $bytes.Length))
      if ($inicio -notmatch '^\s*\{"app":"leitor-de-estudos"') { Responder $s 400 (Json @{ ok = $false; erro = 'formato' }); continue }

      $nome = 'leitor-backup-' + (Get-Date -Format 'yyyy-MM-dd') + '.json'
      $tmp = Join-Path $Destino ('.gravando-' + [guid]::NewGuid().ToString('N') + '.tmp')
      [IO.File]::WriteAllBytes($tmp, $bytes)
      Copy-Item $tmp (Join-Path $Destino 'ultimo-backup.json') -Force
      Move-Item $tmp (Join-Path $Destino $nome) -Force
      Get-ChildItem $Destino -Filter 'leitor-backup-*.json' | Sort-Object Name -Descending |
        Select-Object -Skip $Manter | Remove-Item -Force -ErrorAction SilentlyContinue
      Responder $s 200 (Status)
      continue
    }
    Responder $s 404 (Json @{ ok = $false })
  } catch {
    try { Responder $s 500 (Json @{ ok = $false; erro = $_.Exception.Message }) } catch {}
  } finally {
    $client.Close()
  }
}
