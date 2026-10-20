<#
    DUST STRIKE · 项目备份脚本

    用途：在修改代码之前先跑一次，出一份可随时还原的快照。

    用法（在项目目录下）：
        powershell -ExecutionPolicy Bypass -File .\backup.ps1
        powershell -ExecutionPolicy Bypass -File .\backup.ps1 -Keep 20
        powershell -ExecutionPolicy Bypass -File .\backup.ps1 -Restore "D:\备份\snapshots\dust2-fps-20261020-170500"

    产物：
        D:\备份\dust2-fps\              最新镜像（始终与项目当前状态一致，含 .git）
        D:\备份\snapshots\<时间戳>\      历史快照（默认保留最近 10 份）

    还原：把某个快照目录里的内容复制回项目目录即可（含 .git，历史提交不丢）。
#>

param(
    [string] $DestRoot = 'D:\备份',
    [int]    $Keep = 10,
    [string] $Restore = ''
)

$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot
$SnapshotDir = Join-Path $DestRoot 'snapshots'
$MirrorDir = Join-Path $DestRoot 'dust2-fps'

function Write-Section($text) {
    Write-Host ''
    Write-Host "  $text" -ForegroundColor Yellow
}

# ---------------------------------------------------------------- 还原模式
if ($Restore) {
    if (-not (Test-Path $Restore)) {
        Write-Host "  找不到快照目录：$Restore" -ForegroundColor Red
        exit 1
    }
    Write-Section "还 原 模 式"
    Write-Host "  源快照：$Restore"
    Write-Host "  目标项目：$ProjectDir"
    Write-Host ''
    Write-Host '  提示：同名文件会被覆盖；.git 也会一并还原。' -ForegroundColor DarkGray
    $answer = Read-Host '  确认还原？输入 yes 继续'
    if ($answer -ne 'yes') {
        Write-Host '  已取消。' -ForegroundColor Yellow
        exit 0
    }
    robocopy $Restore $ProjectDir /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
        Write-Host "  还原失败（robocopy 退出码 $LASTEXITCODE）" -ForegroundColor Red
        exit 1
    }
    Write-Host '  还原完成。' -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------- 备份模式
if (-not (Test-Path $DestRoot)) {
    New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null
}
if (-not (Test-Path $SnapshotDir)) {
    New-Item -ItemType Directory -Path $SnapshotDir -Force | Out-Null
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snapshot = Join-Path $SnapshotDir "dust2-fps-$stamp"

Write-Section '备 份 中'
Write-Host "  项目目录：$ProjectDir"
Write-Host "  快照目录：$snapshot"

robocopy $ProjectDir $snapshot /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
    Write-Host "  备份失败（robocopy 退出码 $LASTEXITCODE）" -ForegroundColor Red
    exit 1
}

robocopy $ProjectDir $MirrorDir /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
    Write-Host "  镜像同步失败（robocopy 退出码 $LASTEXITCODE）" -ForegroundColor Red
    exit 1
}

# 清理过旧的快照
$old = Get-ChildItem -Directory $SnapshotDir -Filter 'dust2-fps-*' |
    Sort-Object Name -Descending | Select-Object -Skip $Keep
foreach ($d in $old) {
    Remove-Item -Recurse -Force $d.FullName
    Write-Host "  已清理旧快照：$($d.Name)" -ForegroundColor DarkGray
}

$size = (Get-ChildItem -Recurse -File $snapshot | Measure-Object -Property Length -Sum).Sum
$count = (Get-ChildItem -Recurse -File $snapshot).Count

Write-Host ''
Write-Host '  备份完成 ✓' -ForegroundColor Green
Write-Host "  快照：$snapshot"
Write-Host "  镜像：$MirrorDir"
Write-Host "  共 $count 个文件，$([math]::Round($size / 1MB, 2)) MB（含 .git 历史）"
Write-Host ''
Write-Host '  还原命令：' -ForegroundColor DarkGray
Write-Host "    powershell -ExecutionPolicy Bypass -File .\backup.ps1 -Restore `"$snapshot`""
Write-Host ''
