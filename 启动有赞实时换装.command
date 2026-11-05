#!/bin/zsh
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 20 或更新版本。'
  read '?按回车关闭…'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install --no-audit --no-fund --ignore-scripts || exit 1
fi
print '请保持此窗口开启。PC 访问 http://localhost:5173，手机在页面里点击「手机访问」。'
npm start
read '?服务已结束，按回车关闭…'
