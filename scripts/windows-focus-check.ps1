param([Parameter(Mandatory=$true)][long]$HudHandle, [Parameter(Mandatory=$true)][long]$EditorHandle)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class FocusProbe {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
'@
$hud = [IntPtr]::new($HudHandle)
$rect = New-Object FocusProbe+Rect
if (-not [FocusProbe]::GetWindowRect($hud, [ref]$rect)) { throw 'HUD handle unavailable' }
$form = New-Object System.Windows.Forms.Form
$form.Text = 'External focus test'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Bounds = [System.Drawing.Rectangle]::new($rect.Left - 12, $rect.Top - 12, $rect.Right - $rect.Left + 24, $rect.Bottom - $rect.Top + 24)
$backdrop = [System.Drawing.Color]::FromArgb(53, 72, 91)
$form.BackColor = $backdrop
try {
    $form.Show()
    $form.Activate()
    [void][FocusProbe]::SetForegroundWindow($form.Handle)
    for ($i = 0; $i -lt 10; $i++) {
        [System.Windows.Forms.Application]::DoEvents()
        [System.Threading.Thread]::Sleep(30)
    }
    $title = [System.Text.StringBuilder]::new(256)
    [void][FocusProbe]::GetWindowText($hud, $title, $title.Capacity)
    $editor = [IntPtr]::new($EditorHandle)
    $smallHandle = [FocusProbe]::SendMessage($editor, 0x007F, [IntPtr]::Zero, [IntPtr]::Zero)
    $largeHandle = [FocusProbe]::SendMessage($editor, 0x007F, [IntPtr]::new(1), [IntPtr]::Zero)
    if ($smallHandle -eq [IntPtr]::Zero -or $largeHandle -eq [IntPtr]::Zero) { throw 'Editor icons unavailable' }
    $smallIcon = [System.Drawing.Icon]::FromHandle($smallHandle)
    $largeIcon = [System.Drawing.Icon]::FromHandle($largeHandle)
    try {
        $smallWidth = $smallIcon.Width
        $largeWidth = $largeIcon.Width
    } finally { $smallIcon.Dispose(); $largeIcon.Dispose() }
    $result = @{
        editorSmallIconWidth = $smallWidth
        editorLargeIconWidth = $largeWidth
        expectedSmallIconWidth = [FocusProbe]::GetSystemMetrics(49)
        expectedLargeIconWidth = [FocusProbe]::GetSystemMetrics(11)
        externalFocused = ([FocusProbe]::GetForegroundWindow() -eq $form.Handle)
        style = [FocusProbe]::GetWindowLong($hud, -16)
        exStyle = [FocusProbe]::GetWindowLong($hud, -20)
        title = $title.ToString()
        desktopCaptureAvailable = $false
        clearDesktopCorners = $null
    }
    # Capture the actual desktop, not Chromium's offscreen renderer surface.
    # Some hosted runners have a locked/unavailable desktop; report that
    # explicitly rather than claiming a desktop composition check passed.
    $bitmap = [System.Drawing.Bitmap]::new($form.Width, $form.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($form.Left, $form.Top, 0, 0, $bitmap.Size)
        $result.desktopCaptureAvailable = ($bitmap.GetPixel(4, 4).ToArgb() -eq $backdrop.ToArgb())
        if ($result.desktopCaptureAvailable) {
            $right = $rect.Right - $rect.Left + 11
            $bottom = $rect.Bottom - $rect.Top + 11
            $result.clearDesktopCorners = (
                $bitmap.GetPixel(12, 12).ToArgb() -eq $backdrop.ToArgb() -and
                $bitmap.GetPixel($right, 12).ToArgb() -eq $backdrop.ToArgb() -and
                $bitmap.GetPixel(12, $bottom).ToArgb() -eq $backdrop.ToArgb() -and
                $bitmap.GetPixel($right, $bottom).ToArgb() -eq $backdrop.ToArgb())
        }
    } catch [System.ComponentModel.Win32Exception] {
        $result.desktopCaptureAvailable = $false
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    $result | ConvertTo-Json -Compress
} finally { $form.Close(); $form.Dispose() }
