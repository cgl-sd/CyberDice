# CyberDice

面向小米手环 9 系列与手环 10 系列的离线摇骰子应用，采用 Vela JS 快应用开发，RPK 包名为 `com.vibecoding.cyberdice`。小米手环 9 Pro（336×480）是正式基线；手环 9（192×490）、手环 10（212×520）和手环 10 Pro（336×480）提供体验版布局档，待真机验收后提升为正式支持。

## 目录

```text
├── README.md                 # 项目入口与使用说明
├── AGENTS.md                 # 协作与工程约束
├── package.json              # Node 辅助命令
├── build/                    # 本地构建中间产物（不提交）
├── dist/                     # 最终 RPK 构建产物（不提交）
├── sign/                     # 本地签名材料（不提交；证书和私钥由 AIoT-IDE 生成/导入）
├── src/                      # 快应用源码
│   ├── app.ux                # 应用入口
│   ├── manifest.json         # Vela 路由、能力与包配置
│   ├── common/
│   │   ├── components/       # 可复用 UX 组件
│   │   ├── images/           # 图标、骰子帧和其他运行时图像
│   │   ├── scripts/          # 平台无关逻辑与平台适配器
│   │   └── styles/           # 共享样式
│   ├── i18n/                 # 预留的多语言资源目录
│   └── pages/                # 7 个页面
└── tmp/                      # 非发布内容：测试、模拟器、工具、参考资料与历史记录
```

当前界面文本尚未接入国际化；`src/i18n/` 已预留，新增语言时再添加 `defaults.json`、`zh-CN.json` 和其他语言资源。

## 常用命令

```bash
npm test
npm run sim
# 在浏览器打开 http://127.0.0.1:8931/tmp/sim/index.html
```

资产可用 `node tmp/tools/gen-assets.js` 重建。构建、签名和真机安装按 `tmp/reference/` 中的需求说明执行；`sign/` 绝不应提交真实的 `certificate.pem` 或 `private.pem`。
