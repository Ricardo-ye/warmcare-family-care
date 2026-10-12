# 本地构建与复验

所有下列命令都是本地步骤，不上传或部署。先确认目录包含 package.json 和 project.config.json。

```text
npm ci --ignore-scripts
npm run prepare:cloud
npm run verify
npm --prefix cloudfunctions/warmcare ci --ignore-scripts
npm run runtime:smoke
python -X utf8 scripts/package.py
```

根目录 Node 要求 >=18，本轮实际测试 Node 24.20.0；云函数代码按已有 Node 16.13 环境做兼容验证，不在本轮调整线上运行时。已固定 Prettier 3.6.2、wx-server-sdk 3.0.1，并提交根目录和云函数依赖锁文件。使用 npm ci，不通过删除锁文件“解决”安装差异。

`verify` 包含格式、JS/JSON/页面资源检查、生成入口逐字节核对及测试；不是完整类型检查或安全扫描。修改 core/personal、云 lib 后必须重新 prepare:cloud。`runtime:smoke` 加载真实已安装 SDK，再用替代 SDK/隔离内存数据库执行生成入口的成员、留言、SOS 流程，不访问真实云端。

本轮另用 Node 16.13.0 运行同一 smoke 脚本，证明该运行时可加载安装的 SDK 和执行这组隔离流程，不能代替真实云 SDK 集成测试。测试运行器本身需较新 Node，不使用 Node 16 跑 node:test。

开发者工具：本轮机器为 2.02.2608080，项目基础库按 project.config.json；导入目录如下：

```text
解压位置/
  SOURCE-MANIFEST.json
  nuanxinhu/                 ← 微信开发者工具选择这里
    project.config.json     ← miniprogramRoot 指向 miniprogram/
    package.json
    miniprogram/
      app.json
    cloudfunctions/warmcare/
```

出现“根目录未找到 app.json”，先确认导入的是 nuanxinhu 及上述配置，不要复制一个空 app.json 掩盖路径错误。微信登录和云环境可用性仍是实际启动前提；导入源码包不会自动部署后端。

打包采用目录/扩展名允许清单，排除 node_modules、artifacts、.git、私有配置和 .env 文件。ZIP 含 SHA-256 源文件清单并核对入口路径；代码与测试可分发，不含家庭数据库备份。生成包以版本命名，不覆盖原 4.2.0 包。

SDK 3.0.1 的既有传递依赖安装出现 request、uuid、har-validator 弃用提示；本轮未评估新版 SDK 的云端兼容性，未擅自升级，也未把弃用提示等同于已证实漏洞。目标环境实际集成与依赖升级评估仍列为待办。
