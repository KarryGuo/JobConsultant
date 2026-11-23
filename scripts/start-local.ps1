﻿﻿﻿# 一键启动本地演示环境：PostgreSQL -> 建库 -> 迁移 -> 种子/导入 -> 生产服务。
# 用法：pnpm start:local [-Build] [-NoImport] [-NoStart]
#   -Build     强制重新构建生产包（默认复用已有 .next/BUILD_ID）
#   -NoImport  跳过企业数据导入（导入是幂等的，重复执行安全）
#   -NoStart   只做环境准备，不启动 Web 服务
param(
  [switch]$Build,
  [switch]$NoImport,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

# 便携版 PostgreSQL 路径，可用环境变量 ZGW_PG_BIN / ZGW_PG_DATA 覆盖。
# 默认放在用户持久目录（勿放 Temp，系统清理会删除数据目录）。
$PgBin = $env:ZGW_PG_BIN
if (-not $PgBin) {
  $PgBin = "C:\Users\admin\.local\share\pgsql18\node_modules\@embedded-postgres\windows-x64\native\bin"
}
$PgData = $env:ZGW_PG_DATA
if (-not $PgData) { $PgData = "C:\Users\admin\.local\share\zhiguwen-pg" }

Write-Host "==> [1/6] 检查本地 PostgreSQL"

if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
  Write-Host "    数据目录不存在，初始化新库：$PgData"
  New-Item -ItemType Directory -Force -Path $PgData | Out-Null
  & (Join-Path $PgBin "initdb.exe") -D $PgData -U postgres -E UTF8 -A trust
  if ($LASTEXITCODE -ne 0) {
    throw "initdb 失败，请检查 ZGW_PG_BIN 是否指向便携版 PostgreSQL 的 bin 目录"
  }
}

$listening = Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host "    启动 postgres.exe（端口 5433，后台运行）"
  $errLog = Join-Path $PgData "pg-start.err.log"
  $outLog = Join-Path $PgData "pg-start.out.log"
  Start-Process -FilePath (Join-Path $PgBin "postgres.exe") `
    -ArgumentList @("-D", $PgData, "-p", "5433") `
    -WindowStyle Hidden `
    -RedirectStandardError $errLog -RedirectStandardOutput $outLog

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    if (Test-Path $errLog) { Get-Content $errLog | Write-Host }
    throw "PostgreSQL 未能监听 5433，请查看日志 $errLog"
  }
}
Write-Host "    PostgreSQL 就绪"

Write-Host "==> [2/6] 确保数据库存在"
node --env-file=.env (Join-Path $PSScriptRoot "bootstrap-db.mjs")
if ($LASTEXITCODE -ne 0) { throw "数据库初始化失败" }

Write-Host "==> [3/6] 应用数据库迁移"
pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "数据库迁移失败" }

Write-Host "==> [4/6] 初始化来源注册表"
pnpm seed:sources
if ($LASTEXITCODE -ne 0) { throw "来源种子失败" }

if ($NoImport) {
  Write-Host "==> [5/6] 跳过企业数据导入"
} else {
  Write-Host "==> [5/6] 导入企业数据（幂等）"
  pnpm import:data
  if ($LASTEXITCODE -ne 0) { throw "企业数据导入失败" }

  Write-Host "    校验公告解析器"
  pnpm check:announcements
  if ($LASTEXITCODE -ne 0) { throw "公告解析器回归失败" }

  Write-Host "    补齐历史信号血缘"
  pnpm backfill:lineage
  if ($LASTEXITCODE -ne 0) { throw "血缘回填失败" }

  Write-Host "    校验证据链"
  pnpm check:evidence -- --require-lineage
  if ($LASTEXITCODE -ne 0) { throw "证据链校验失败" }
}

if ($Build -or -not (Test-Path ".next/BUILD_ID") -or (Test-Path ".next/standalone")) {
  Write-Host "==> [6/6] 构建生产包"
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw "构建失败" }
} else {
  Write-Host "==> [6/6] 复用现有构建（加 -Build 参数可强制重建）"
}

if (-not $NoStart) {
  Write-Host ""
  Write-Host "启动服务：http://127.0.0.1:3000 （Ctrl+C 停止）"
  pnpm start
}
