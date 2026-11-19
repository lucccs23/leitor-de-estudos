# Gera os ícones e as telas de abertura do app de Android a partir dos ícones do Vetra (icons/).
# Rode de novo só se o ícone do Vetra mudar:  powershell -File mobile/build/icones.ps1
Add-Type -AssemblyName System.Drawing
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$res = Join-Path $raiz 'mobile\android\app\src\main\res'
$icone = [System.Drawing.Image]::FromFile((Join-Path $raiz 'icons\icon-512.png'))
$maskable = [System.Drawing.Bitmap]::FromFile((Join-Path $raiz 'icons\icon-maskable-512.png'))
$fundo = $maskable.GetPixel(4, 4)

function Salvar($img, $w, $h, $arquivo, $cor = $null, $escala = 1.0) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($cor) { $g.Clear($cor) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $lado = [int]([Math]::Min($w, $h) * $escala)
  $g.DrawImage($img, [int](($w - $lado) / 2), [int](($h - $lado) / 2), $lado, $lado)
  $g.Dispose(); $bmp.Save($arquivo, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

$dens = @{ 'mdpi' = 1.0; 'hdpi' = 1.5; 'xhdpi' = 2.0; 'xxhdpi' = 3.0; 'xxxhdpi' = 4.0 }
foreach ($d in $dens.Keys) {
  $pasta = Join-Path $res "mipmap-$d"
  $n = [int](48 * $dens[$d]); $f = [int](108 * $dens[$d])
  Salvar $icone $n $n (Join-Path $pasta 'ic_launcher.png')
  Salvar $icone $n $n (Join-Path $pasta 'ic_launcher_round.png')
  Salvar $maskable $f $f (Join-Path $pasta 'ic_launcher_foreground.png')
}
# cor de fundo do ícone adaptável = fundo do ícone do Vetra
$hex = '#{0:X2}{1:X2}{2:X2}' -f $fundo.R, $fundo.G, $fundo.B
Set-Content -Encoding UTF8 (Join-Path $res 'values\ic_launcher_background.xml') "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$hex</color>`n</resources>"
# telas de abertura: ícone no centro, sobre o fundo escuro do Vetra (mesmos tamanhos que o modelo do Capacitor)
$escuro = [System.Drawing.ColorTranslator]::FromHtml("#16171B")
Get-ChildItem $res -Recurse -Filter 'splash.png' | ForEach-Object {
  $velho = [System.Drawing.Image]::FromFile($_.FullName); $w = $velho.Width; $h = $velho.Height; $velho.Dispose()
  Salvar $icone $w $h $_.FullName $escuro 0.28
}
$icone.Dispose(); $maskable.Dispose()
"Ícones e telas de abertura gerados (fundo $hex)."
