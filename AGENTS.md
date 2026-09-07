# AGENTS.md — CyberDice 工作区指引

CyberDice 是面向小米手环 9、9 Pro、10、10 Pro 的 Vela JS 快应用，包名 `com.vibecoding.cyberdice`，发布物为 RPK。9 Pro（336×480）为正式基线；9（192×490）、10（212×520）与 10 Pro（336×480）为真机验收前的体验版。唯一需求基线位于 `tmp/reference/Wrist_Dice_小米手环9Pro_产品需求与程序设计说明书.md`；改动功能、阈值或架构前必须先读它。结构调整和功能变更记入 `tmp/project-history/CHANGELOG.md`。

## 目录职责

- `src/app.ux` 与 `src/manifest.json` 是应用入口和 Vela 配置。
- `src/pages/` 放路由页面；当前页面直接承载 UI，不保留未使用的组件层。
- `src/common/images/` 是随 RPK 发布的图片；`src/common/styles/` 是共享样式；`src/common/scripts/` 是 JavaScript 模块。
- `src/i18n/` 预留本地化资源；接入前不要让未使用的翻译文件替代现有界面文案。
- `build/`、`dist/`、`sign/` 只存本地构建、成品和凭据，不提交真实签名材料。
- `tmp/` 仅放非发布内容：`test/`、`reference/`、`project-history/`。

## 命令与验证

- 单元测试：`npm test`（测试一律在 `tmp/test/`，用假时钟，禁止真实 sleep）。
- 构建：`npm run build`；AIoT IDE 调试或 `npm start` 安装到 Vela 虚拟设备。
- 真机验收不能由模拟器替代；9、9 Pro、10、10 Pro 的传感器阈值、RPK 签名和安装流程以需求说明为准。体验版不能被标记为正式支持。

## 架构边界

- `src/common/scripts/dice-engine.js`、`shake-detector.js`、`roll-controller.js` 和 `store.js` 必须保持平台无关：不得 `require('@system.*')` 或操作 UI；时间与定时器须可通过选项注入。
- 平台 API 只能出现在 `sensor-adapter.js`、`feedback-service.js` 和 `storage-adapter.js`，并且必须用 `try/catch` 吞掉异常，确保传感器、震动和存储失败不会阻塞 UI（FR-010）。
- 页面使用 `this.$app.$def.store` 读取和订阅状态。控制器位于 app 层，首页负责传感器的 `onShow` 订阅与 `onHide`/`onDestroy` 退订及定时器清理。
- 随机结果只能在 RollController 进入 `RESULT` 时由 DiceEngine 生成一次；传感器仅决定何时掷骰，动画帧不可影响最终结果（NFR-07）。
- 阈值和持续时间只在 `src/common/scripts/constants.js` 集中维护。禁止联网、fetch 与 BLE；应用必须可离线运行。

## UI 与安全

- 遵循 336px 设计宽度基线：矩形屏骰子 184、结果刻度环 276；小尺寸手环以 `@media (max-width: 160)` 适配安全区与触控卡片。manifest 必须保留 `designWidth: 336`；最终数值必须直接显示，不能只依赖颜色传达结果。
- 不删除用户内容；归档使用移动到 `tmp/`。不要创建伪造的 PEM 文件，也不要在日志、测试或文档中暴露真实私钥。
