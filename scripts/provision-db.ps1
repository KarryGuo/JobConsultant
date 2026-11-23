﻿# 生产数据库初始化脚本：迁移 -> 来源种子 -> 企业导入。
# 用法：powershell -File scripts/provision-db.ps1 -DatabaseUrl "<生产连接串>"
# 幂等：重复执行安全，不会重复导入或回退人工复核时间。
param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"

if ($DatabaseUrl -notmatch '^postgresql://') {
  throw "DATABASE_URL 必须是 postgresql:// 连接串"
}

Write-Host "==> [1/6] 应用数据库迁移"
$env:DATABASE_URL = $DatabaseUrl
pnpm exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "迁移失败" }

Write-Host "==> [2/6] 初始化来源注册表"
pnpm seed:sources
if ($LASTEXITCODE -ne 0) { throw "来源种子失败" }

Write-Host "==> [3/6] 校验公告解析器"
pnpm check:announcements
if ($LASTEXITCODE -ne 0) { throw "公告解析器回归失败" }

Write-Host "==> [4/6] 导入企业数据"
pnpm import:data
if ($LASTEXITCODE -ne 0) { throw "企业数据导入失败" }

Write-Host "==> [5/6] 补齐历史信号血缘"
pnpm backfill:lineage
if ($LASTEXITCODE -ne 0) { throw "血缘回填失败" }

Write-Host "==> [6/6] 校验证据链"
pnpm check:evidence -- --require-lineage
if ($LASTEXITCODE -ne 0) { throw "证据链校验失败" }

Write-Host ""
Write-Host "生产数据库初始化完成。验证方式："
Write-Host "  pnpm exec prisma db pull  # 确认表结构"
Write-Host "  或直接访问 https://<your-domain>/api/health 确认 db:true"
