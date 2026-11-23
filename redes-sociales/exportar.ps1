# =====================================================================
# IMPULSA CREDITO - Exportar las piezas de redes sociales
# =====================================================================
# QUE HACE
#   Convierte cada pieza de piezas.html en una imagen JPG lista para
#   subir a Instagram o TikTok. Las deja en la carpeta "exportadas".
#
# COMO USARLO
#   Clic derecho sobre este archivo -> "Ejecutar con PowerShell".
#   Tarda menos de un minuto. Necesita internet (para la letra Montserrat).
#
# CUANDO VOLVER A USARLO
#   Cada vez que cambies algo en piezas.html o en js/config.js
#   (por ejemplo el numero de WhatsApp o la comision).
# =====================================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$aqui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$salida  = Join-Path $aqui 'exportadas'
$temp    = Join-Path $env:TEMP 'ic-piezas'
$perfil  = Join-Path $env:TEMP 'ic-piezas-navegador'
$base    = ([System.Uri](Join-Path $aqui 'piezas.html')).AbsoluteUri

# Edge viene con Windows; si no esta, se usa Chrome
$nav = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $nav) { throw 'No encontre Microsoft Edge ni Google Chrome en este equipo.' }

New-Item -ItemType Directory -Force -Path $salida, $temp | Out-Null
# Se empieza de cero para que no queden imagenes de piezas que ya no existen
Get-ChildItem $salida -Filter *.jpg | Remove-Item
$comunes = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
             '--force-device-scale-factor=1', "--user-data-dir=`"$perfil`"")

# 1. Pedir a la pagina la lista de piezas (asi no hay que mantenerla aqui)
$dom = Join-Path $temp 'lista.html'
Start-Process -FilePath $nav -Wait -NoNewWindow -RedirectStandardOutput $dom `
  -ArgumentList ($comunes + @('--virtual-time-budget=3000', '--dump-dom', "`"$base`?p=lista`""))
$m = [regex]::Match((Get-Content $dom -Raw -Encoding UTF8), '<pre id="lista">(.*?)</pre>')
if (-not $m.Success) { throw 'No pude leer la lista de piezas de piezas.html' }
$piezas = $m.Groups[1].Value | ConvertFrom-Json

# 2. Fotografiar cada pieza y guardarla como JPG de alta calidad
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$calidad = New-Object System.Drawing.Imaging.EncoderParameters 1
$calidad.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 95L

$n = 0
foreach ($p in $piezas) {
  $n++
  Write-Host ("[{0}/{1}] {2}" -f $n, $piezas.Count, $p.id)
  $png = Join-Path $temp ($p.id + '.png')
  if (Test-Path $png) { Remove-Item $png }
  Start-Process -FilePath $nav -Wait -NoNewWindow `
    -ArgumentList ($comunes + @("--window-size=$($p.w),$($p.h)", '--virtual-time-budget=4000',
                                "--screenshot=`"$png`"", "`"$base`?p=$($p.id)`""))
  if (-not (Test-Path $png)) { Write-Warning "No se genero $($p.id)"; continue }

  $img = [System.Drawing.Image]::FromFile($png)
  try { $img.Save((Join-Path $salida ($p.id + '.jpg')), $codec, $calidad) } finally { $img.Dispose() }
}

Write-Host ''
Write-Host "Listo: $n imagenes en $salida" -ForegroundColor Green
