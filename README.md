# 有赞实时换装

PC 和手机实时试衣，支持 Xmax 与 Decart，最多 4 个窗口同时比较同一摄像头和服饰。

## 使用

```sh
npm install --ignore-scripts
npm start
```

在 `.env` 中设置 `XMAX_API_KEY` 和 `DECART_API_KEY`，打开 http://localhost:5173 。这台电脑已经配置，密钥不进入源码或公开网页。

1. 开启摄像头，选择服饰。
2. 每个画面左上角选择模型，点击开始试衣。
3. 顶栏左侧第一个按钮添加对比窗口，最多 4 个；第二个按钮另开浏览器窗口。
4. 可逐窗开始、停止、关闭；「开始对比」「停止全部」控制当前页面所有窗口。运行中换模型会停止旧模型并启动新模型。
5. 换服饰会更新所有正在运行的窗口；同组弹出窗口同步服饰选择，包含上传商品图。停止某个窗口不会关闭其他窗口或摄像头预览。

无自动停止倒计时或人为试玩积分上限。实际消费来自两家账户已有余额；同时运行多个模型分别计费。不会充值，代理不会替用户开启生成。切后台或离开页面会停止会话。

## 模型

- Xmax：X2.1、X2.0。
- Decart：Lucy VTON 3.6、VTON 3.5、Lucy 2.6、Lucy 2.5。

选择的是 SDK 公开支持的模型，实际权限、并发和余额由供应商账户决定。Decart 默认标准模式，不开启额外收费的 fast mode。

## 手机公网体验

前端发布在 [GitHub Pages](https://chenfeiyu01.github.io/youzan-realtime-tryon/)。GitHub Pages 不运行后端，手机多模型授权由这台电脑的服务提供：

```sh
npm run share
```

也可双击「启动手机公网体验.command」。需要官方 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)；这台电脑已在忽略的 `.local/` 准备客户端。命令会在未启动时拉起本地应用，启动 HTTPS 公网授权通道，生成完整体验链接，并更新上一级文件夹中的手机二维码。

电脑应用和公网通道需要保持运行。重开通道时域名可能变化，应使用新生成的完整链接。手机不必同一 Wi-Fi，也不用安装证书。只透传受授权保护的 API，不公开本地开发站点或文件，不通过电脑中转摄像头视频。

永久 Key 只留在 `.env`。Decart 使用服务端签发的短期 client token，按需刷新；其过期只影响新连接，不中断已建立的实时会话。不设置 `maxSessionDuration`。Xmax 每窗口单独签发临时 Key，停止时停用。页面内的全局并发上限为 4，上游可能更低。

局域网手机入口仍可通过本机 HTTPS 3443 和配对证书使用。原「启动有赞实时换装.command」保留；首次证书步骤收在手机访问弹窗。

## 结构与验证

- `src/main.js`：窗口、摄像头和衣橱交互。
- `src/providers.js`：Xmax/Decart 连接及资源释放。
- `src/models.js`：可选模型。
- `src/camera.js`：720×1280 竖屏/1280×720 横屏采集；窗口只克隆轨道，不重复申请摄像头。
- `server.mjs`：本地 API 与公网授权 API（回环 5174）。
- `src/runtime.js`：托管页面路由、旧 Xmax 链接兼容。
- `scripts/start-bridge.mjs`：Cloudflare Quick Tunnel 与分享链接。

已完成发布构建、原始凭据排除、授权通路及离线生命周期检查。Decart 仅验证了临时凭证签发，没有开启摄像头、WebRTC 或调用生成模型；真实速度、效果和设备兼容性由用户体验。

预设 16 件商品演示素材，支持上传 JPG/PNG/WebP。裤装与鞋履需相应部位完整入镜。当前单张参考图不保证商品背面的印花、口袋或拉链准确。开场视觉素材及提示词见 `design-assets.md`。

官方资料：[Decart SDK](https://github.com/DecartAI/sdk)、[Decart 试衣示例](https://github.com/DecartAI/tryon-examples)、[Client Tokens](https://docs.platform.decart.ai/getting-started/client-tokens)、[Xmax SDK](https://github.com/Xmax-AI/XmaxSDK-Web)。
