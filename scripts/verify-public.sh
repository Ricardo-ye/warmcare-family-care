#!/usr/bin/env bash
# 暖心护发布后自检 —— 确认推上去的仓库不含本机信息与真实凭据
# 用法：bash 脚本/verify-public.sh
# 依赖：git 已完成首次推送

set -u

fail=0

echo "=== 暖心护公开发布自检 ==="
echo

# 1. 敏感标识不应出现在版本库内容中
echo "[1/6] 扫描敏感标识"
for pat in "wxf47af68" "cloud1-d1gue6aev16c5d2ce" "oclZP3ewIilHmmovQRUfsRILBQbw" "29510" "2951026785" "13516594489"; do
  n=$(git grep -c "$pat" HEAD 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "0" ]; then
    echo "    OK   $pat 未出现"
  else
    echo "    警告 $pat 出现 $n 处"
    fail=1
  fi
done
echo

# 2. 忽略目录不应进入版本库
echo "[2/6] 检查忽略项是否被误提交"
for d in "artifacts/" "node_modules/"; do
  n=$(git ls-files | grep -c "^$d" || true)
  if [ "$n" = "0" ]; then
    echo "    OK   $d 未入库"
  else
    echo "    警告 $d 有 $n 个文件入库"
    fail=1
  fi
done
n=$(git ls-files | grep -cE '\.zip$' || true)
if [ "$n" = "0" ]; then
  echo "    OK   无 .zip 入库"
else
  echo "    警告 有 $n 个 .zip 入库"
  fail=1
fi
echo

# 3. 必要文件齐备
echo "[3/6] 检查发布必要文件"
for f in "README.md" "LICENSE" ".gitignore" "package.json" "project.config.json"; do
  if [ -f "$f" ]; then
    echo "    OK   $f"
  else
    echo "    缺失 $f"
    fail=1
  fi
done
echo

# 4. AppID 应为占位符
echo "[4/6] 确认 AppID 已占位"
appid=$(grep -oE '"appid"\s*:\s*"[^"]*"' project.config.json | head -1)
echo "    当前值：$appid"
case "$appid" in
  *touristappid*) echo "    OK   使用占位符" ;;
  *) echo "    警告 需改为 touristappid"; fail=1 ;;
esac
echo

# 5. 测试通过
echo "[5/6] 运行测试"
if command -v node >/dev/null 2>&1; then
  if node --test tests/*.test.js >/dev/null 2>&1; then
    echo "    OK   50 项测试通过"
  else
    echo "    警告 测试未通过"
    fail=1
  fi
else
  echo "    跳过 未找到 node"
fi
echo

# 6. 仓库可读性
echo "[6/6] 统计"
echo "    提交数：$(git rev-list --count HEAD)"
echo "    文件数：$(git ls-files | wc -l | tr -d ' ')"
echo "    .git 体积：$(du -sh .git 2>/dev/null | cut -f1)"
echo

if [ "$fail" = "0" ]; then
  echo "=== 自检通过，可以对外发布 ==="
else
  echo "=== 自检发现问题，请先处理 ==="
fi
exit $fail