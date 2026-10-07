param(
    [string]$Option = "A" # "A", "B", or "C"
)

Add-Type -AssemblyName System.Drawing

$srcFile = switch ($Option.ToUpper()) {
    "A" { "C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\tight_opt1_512.png" }
    "B" { "C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\tight_opt2_512.png" }
    "C" { "C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\tight_opt3_512.png" }
    Default { "C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\tight_opt1_512.png" }
}

Write-Host "Applying Option $Option from $srcFile"
$master = [System.Drawing.Bitmap]::FromFile($srcFile)

function ResizeBmp([System.Drawing.Bitmap]$srcBmp, [int]$sz) {
    $res = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($res)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $sz, $sz)
    $g.Dispose()
    return $res
}

function BitmapToPngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return $bytes
}

function BuildMultiIco($pngList) {
    $count = $pngList.Count
    $headerLen = 6 + (16 * $count)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$count)

    $currOffset = $headerLen
    foreach ($item in $pngList) {
        $w = if ($item.Size -ge 256) { 0 } else { [byte]$item.Size }
        $h = if ($item.Size -ge 256) { 0 } else { [byte]$item.Size }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$item.Bytes.Length)
        $bw.Write([uint32]$currOffset)
        $currOffset += $item.Bytes.Length
    }

    foreach ($item in $pngList) {
        $bytes = [byte[]]$item.Bytes
        $ms.Write($bytes, 0, $bytes.Length)
    }

    $bw.Flush()
    $icoBytes = $ms.ToArray()
    $bw.Dispose()
    $ms.Dispose()
    return $icoBytes
}

$assetsDir = "d:\Dev\bullsNote\electron\assets"

# 1. Main 512x512 icon.png
$master512 = ResizeBmp $master 512
$master512.Save((Join-Path $assetsDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$master512.Dispose()
Write-Host "Saved icon.png (512x512)"

# 2. Multi-resolution icon.ico (256, 128, 64, 48, 32, 16)
$icoSizes = @(256, 128, 64, 48, 32, 16)
$pngList = @()
foreach ($sz in $icoSizes) {
    $bmp = ResizeBmp $master $sz
    $pngBytes = BitmapToPngBytes $bmp
    $bmp.Dispose()
    $pngList += @{ Size = $sz; Bytes = $pngBytes }
}
$icoBytes = BuildMultiIco $pngList
[System.IO.File]::WriteAllBytes((Join-Path $assetsDir "icon.ico"), $icoBytes)
Write-Host "Saved icon.ico with 6 resolutions ($($icoBytes.Length) bytes)"

# 3. Windows Tray Icon (32x32)
$trayWin = ResizeBmp $master 32
$trayWin.Save((Join-Path $assetsDir "tray-icon-win.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayWin.Dispose()
Write-Host "Saved tray-icon-win.png (32x32)"

# 4. macOS Tray Icons (22x22 and 44x44)
$trayMac = ResizeBmp $master 22
$trayMac.Save((Join-Path $assetsDir "tray-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayMac.Dispose()
Write-Host "Saved tray-icon.png (22x22)"

$trayMac2x = ResizeBmp $master 44
$trayMac2x.Save((Join-Path $assetsDir "tray-icon@2x.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayMac2x.Dispose()
Write-Host "Saved tray-icon@2x.png (44x44)"

$master.Dispose()
Write-Host "Option $Option applied successfully!"
