Add-Type -AssemblyName System.Drawing

function CreateRoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2

    $arc = New-Object System.Drawing.RectangleF($x, $y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)

    $arc.X = $x + $width - $diameter
    $path.AddArc($arc, 270, 90)

    $arc.Y = $y + $height - $diameter
    $path.AddArc($arc, 0, 90)

    $arc.X = $x
    $path.AddArc($arc, 90, 90)

    $path.CloseFigure()
    return $path
}

function RenderAppIconMaster {
    $srcApp = [System.Drawing.Bitmap]::FromFile("C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\bullsnote_app_icon_1791377035871.jpg")
    $app512 = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($app512)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $appPath = CreateRoundedRectanglePath 8 8 496 496 115
    $g.SetClip($appPath)
    $srcRect = New-Object System.Drawing.Rectangle(96, 92, 832, 832)
    $dstRect = New-Object System.Drawing.Rectangle(8, 8, 496, 496)
    $g.DrawImage($srcApp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetClip()
    $g.Dispose()
    $srcApp.Dispose()
    return $app512
}

function ResizeBitmap($srcBmp, [int]$size) {
    $res = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($res)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $size, $size)
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
    # $pngList is array of hashtables @{ Size = 256; Bytes = byte[] }
    $count = $pngList.Count
    $headerLen = 6 + (16 * $count)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # ICONDIR header
    $bw.Write([uint16]0) # Reserved
    $bw.Write([uint16]1) # Type 1 = Icon
    $bw.Write([uint16]$count)

    # Compute offsets
    $currOffset = $headerLen
    foreach ($item in $pngList) {
        $w = if ($item.Size -ge 256) { 0 } else { [byte]$item.Size }
        $h = if ($item.Size -ge 256) { 0 } else { [byte]$item.Size }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0)   # Color count
        $bw.Write([byte]0)   # Reserved
        $bw.Write([uint16]1) # Planes
        $bw.Write([uint16]32)# Bit count
        $bw.Write([uint32]$item.Bytes.Length)
        $bw.Write([uint32]$currOffset)
        $currOffset += $item.Bytes.Length
    }

    # Write image data
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

function RenderTrayIconMaster {
    $srcTray = [System.Drawing.Bitmap]::FromFile("C:\Users\bulls\.gemini\antigravity-ide\brain\6aa6a343-5c81-45df-af16-ec50eee1ef48\bullsnote_tray_glyph_1791377375193.jpg")
    $crop = New-Object System.Drawing.Bitmap(852, 852, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($crop)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(1.0, 1.0, 850.0, 850.0)
    $g.SetClip($path)

    $srcR = New-Object System.Drawing.Rectangle(86, 86, 852, 852)
    $dstR = New-Object System.Drawing.Rectangle(0, 0, 852, 852)
    $g.DrawImage($srcTray, $dstR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetClip()
    $g.Dispose()
    $srcTray.Dispose()
    return $crop
}

# Generate all assets
$assetsDir = "d:\Dev\bullsNote\electron\assets"

# 1. Main App Icon
Write-Host "Rendering master app icon..."
$masterApp = RenderAppIconMaster
$masterApp.Save((Join-Path $assetsDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved icon.png (512x512)"

# Build ICO with sizes 256, 128, 64, 48, 32, 16
$icoSizes = @(256, 128, 64, 48, 32, 16)
$pngList = @()
foreach ($sz in $icoSizes) {
    $bmp = ResizeBitmap $masterApp $sz
    $pngBytes = BitmapToPngBytes $bmp
    $bmp.Dispose()
    $pngList += @{ Size = $sz; Bytes = $pngBytes }
    Write-Host "Prepared ICO size ${sz}x${sz} ($($pngBytes.Length) bytes)"
}
$icoBytes = BuildMultiIco $pngList
[System.IO.File]::WriteAllBytes((Join-Path $assetsDir "icon.ico"), $icoBytes)
Write-Host "Saved icon.ico with 6 resolutions ($($icoBytes.Length) bytes)"
$masterApp.Dispose()

# 2. Tray Icons
Write-Host "Rendering master tray icon..."
$masterTray = RenderTrayIconMaster

# Windows tray icon (32x32)
$trayWin = ResizeBitmap $masterTray 32
$trayWin.Save((Join-Path $assetsDir "tray-icon-win.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayWin.Dispose()
Write-Host "Saved tray-icon-win.png (32x32)"

# macOS tray icons (22x22 and 44x44 @2x)
$trayMac = ResizeBitmap $masterTray 22
$trayMac.Save((Join-Path $assetsDir "tray-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayMac.Dispose()
Write-Host "Saved tray-icon.png (22x22)"

$trayMac2x = ResizeBitmap $masterTray 44
$trayMac2x.Save((Join-Path $assetsDir "tray-icon@2x.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$trayMac2x.Dispose()
Write-Host "Saved tray-icon@2x.png (44x44)"

$masterTray.Dispose()
Write-Host "All assets generated successfully!"
