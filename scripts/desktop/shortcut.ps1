$ErrorActionPreference = 'Stop'
try {
    $repo = [IO.Path]::GetFullPath($env:RBRWX_SHORTCUT_ROOT)
    $launcher = Join-Path $repo 'Launch RBRWX.cmd'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Launch RBRWX.cmd is missing.' }
    $desktop = [Environment]::GetFolderPath('DesktopDirectory')
    $destination = Join-Path $desktop 'RBRWX NEXT.lnk'
    $shell = New-Object -ComObject WScript.Shell
    if (Test-Path -LiteralPath $destination) {
        $existing = $shell.CreateShortcut($destination)
        if ($existing.TargetPath -ne $launcher) { throw 'A different RBRWX NEXT shortcut already exists. Rename it before creating this shortcut.' }
    }
    $shortcut = $shell.CreateShortcut($destination)
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = $repo
    $shortcut.IconLocation = (Join-Path $repo 'src-tauri\icons\icon.ico') + ',0'
    $shortcut.Description = 'Launch the current RBRWX NEXT application'
    $shortcut.WindowStyle = 1
    $shortcut.Save()
} catch {
    Write-Error $_
    exit 1
}
