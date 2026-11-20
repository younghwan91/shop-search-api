# 떠리몰 새 상품 알림을 Windows 작업 스케줄러에 등록한다.
# 기본: 평일 12:30, 18:30
#
#   pwsh scripts/register-watch-task.ps1
#   pwsh scripts/register-watch-task.ps1 -Times "09:00","13:00","18:30"
#   pwsh scripts/register-watch-task.ps1 -Unregister

param(
  [string[]]$Times = @("12:30", "18:30"),
  [string]$TaskName = "thirtymall-watch",
  [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "삭제됨: $TaskName"
  return
}

$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$log = Join-Path $repo "data\watch.log"

if (-not (Test-Path (Join-Path $repo "dist\watch.js"))) {
  throw "dist\watch.js 가 없습니다. 먼저 npm run build"
}
$envFile = Join-Path $repo ".env"
if (-not (Test-Path $envFile) -or -not (Select-String -Path $envFile -Pattern "^DISCORD_WEBHOOK_URL=https://" -Quiet)) {
  throw ".env 에 DISCORD_WEBHOOK_URL 이 없습니다"
}
New-Item -ItemType Directory -Force (Join-Path $repo "data") | Out-Null

# 출력은 data\watch.log 에 쌓는다
$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"`"$node`" dist\watch.js >> `"$log`" 2>&1`"" `
  -WorkingDirectory $repo

$days = "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"
$triggers = $Times | ForEach-Object { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $_ }

# 예약 시각에 PC가 꺼져 있었으면 켜질 때 한 번 실행
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
  -Description "떠리몰 새 상품 디스코드 알림" -Force | Out-Null

Write-Host "등록됨: $TaskName (평일 $($Times -join ', '))"
Write-Host "로그: $log"
