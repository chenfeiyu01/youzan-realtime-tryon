# 有赞实时换装

- 目标：PC/手机摄像头实时换装；大面积画面、右侧窄衣橱，克制黑白视觉。用户要求手动停止、可切换模型、多窗口同时对比；禁止代理自行运行生成以节省积分。
- 入口：`npm start`（localhost:5173、局域网 HTTPS:3443）；`npm run share` 或「启动手机公网体验.command」启动手机公网授权通道。原启动 command 仍用于本地应用。
- 公开前端：https://chenfeiyu01.github.io/youzan-realtime-tryon/ 。源码 main、构建 gh-pages，`npm run build`。手机多模型链接带 bridge/grant query，由本地手机按钮或 share 命令生成；不要提交该完整链接。
- 结构：src/main.js 管理多窗口、单摄像头与共同衣橱；src/models.js 模型注册与 4 窗上限；src/providers.js 封装 Xmax/Decart 的连接、换图和释放；src/runtime.js 在本地 API、受保护公网授权 API、旧 Xmax 静态凭证之间路由；server.mjs 提供 API 与凭证签发；scripts/start-bridge.mjs 管理 Cloudflare Quick Tunnel。
- 模型：Xmax X2.1/X2.0（SDK 1.1.3）；Decart VTON 3.6/3.5、Lucy 2.6/2.5（@decartai/sdk 0.2.14，名称已在 SDK 本地注册表核实）。不启用额外收费的 fast mode。
- 对比：最多 4 个页面内窗口，摄像头只采集一次，每个模型克隆独立轨道，使用同一件参考服饰。逐窗选择/开始/停止/关闭；全部开始、全部停止；运行中切模型先关闭旧连接再启动新模型。左上角可另开独立浏览器窗口；同一组独立窗口经随机 room 的 BroadcastChannel 同步商品选择和上传 File；浏览器或上游账号可能限制实际并发。
- 布局：单窗保留原大画面；PC 双窗并排、3/4 窗 2×2，手机双窗上下、3/4 窗 2×2。保持 portrait 720×1280 采集及 contain/fit，不再额外裁切视频。不同模型的真实输出、延迟与画质需用户实测。
- 摄像头：src/camera.js 保留触屏方向检测和真正竖屏 canvas 流；20 fps、约720p。每个 SDK 使用轨道 clone，停止一窗不关闭其他窗口或本地预览。后台/离开页面仍停止连接并释放摄像头。
- 手动停止：无播放倒计时、准备/首帧等待限时、60 积分试玩上限。Xmax 临时 Key 24 小时、必填 pointsLimit=2147483647、每 Key 并发 1；每个窗口单独签发。Decart 临时凭证按需签发、模型和浏览器 Origin 绑定，600 秒签发窗口，无 maxSessionDuration；过期不终止已经建立的 Decart 会话，后续鉴权按需刷新。账户余额和上游权限仍适用。
- 凭据：XMAX_API_KEY、DECART_API_KEY 仅在忽略且权限 600 的 .env。原始 Key 不发送给网页、不进入源码/构建/Git。网页只收到签名临时凭证。Bridge grant 是访问授权 API 的随机能力凭证，位于 .local/bridge-access.json；完整分享链接与二维码不提交。
- 公网授权：仅本机回环 5174 暴露 API；Cloudflare Quick Tunnel 将其转成 HTTPS。只接收 GitHub Pages Origin，验证 Authorization bearer，允许 CORS 预检；不提供 Vite、文件、永久 Key 或摄像头转发。电脑应用和 Tunnel 需保持运行；进程重开后 Quick Tunnel 域名可能变化，应使用新生成链接。没有部署常驻云后端。
- 安全边界：全局最多 4 个未关闭/申请中的服务端会话。Xmax 停止时停用临时 Key，失败保留记录重试；Decart SDK disconnect，服务端移除本地记录（官方临时凭证不可提前撤销）。不是独立的 Decart 服务端断流保障。无后台充值或主动开启生成。
- 素材：21 件参考服饰，上传 JPG/PNG/WebP，10MB 内；选择服饰只在已运行的模型窗口更新。衣橱名称仅作无障碍和悬停提示，无商品小字、标语或教程。视觉来源和 imagegen 开场静物的提示词在 design-assets.md。
- 验证：语法和发布构建；两家原始 Key/bridge grant 排除；授权 API 配置、未授权拒绝、公网 HTTPS/CORS 预检、Decart 签发临时 token 后删除未使用会话；伪 SDK 离线检查窗口轨道独立、换图、单窗释放、连接中取消；runtime bridge 传递检查包含存储被禁用。没有开摄像头、WebRTC 或生成模型，也未做真实浏览器体验。
- 未验证：真实设备连通/速度、上游账号并发、实际计费、服饰保真和转身背部。当前单图参考不能保证真实商品背面细节；不能承诺准确的印花/口袋/拉链背面重建。

- 衣橱更新：移除 collection-177 花卉长裙、collection-85 红格纹衬衫、collection-86 蓝色花卉衬衫及对应本地素材。新增 imagegen 独立生成的 6 张低饱和正面白底参考图：灰褐不对称西装、燕麦短夹克、炭灰斜领针织、雾绿褶裥衬衫、石灰褶裥阔腿裤、烟灰马甲套装；共 19 件（上衣8、裤装3、套装4、鞋履4）。新款带独立剪裁/颜色提示词；Decart 优先读取条目 decartPrompt。素材与生成提示词在 design-assets.md，未验证真实上身效果。

- 上传入口：右侧分类下方提供明确的「上传衣服」文字按钮（PC/手机，44px 点击高度），替换原不明显的加号。支持 JPG/PNG/WebP、单张 10MB；先解码确认图片可读，补齐部分移动文件缺失的 MIME，上传完成加入当前分类、置顶并选中；沿用已有同屏/弹窗服饰同步与运行模型更新。上传内容只在本次页面内存保留，不自动启动闲置模型。未执行真实相册、摄像头或生成测试。

- 上传后抠图：src/cutout-editor.js 提供原图/抠图预览、擦除/还原笔刷、重置与确认；确认前不加入衣橱，可取消或直接用原图。按后端 config.cutout 启用；服务未就绪时沿用原图上传，不阻塞使用。server/cutout.mjs 使用 onnxruntime-node 1.31.1 + sharp 0.35.5、本地 U2netp 模型做通用去背景，非生成式服饰重建；模特仍可能保留，需要手动擦除。结果裁掉空白后合成 1200×1200 白底 JPEG；选图、修整与确认不会主动开启闲置试衣模型。
- 抠图准备：npm run prepare:cutout 下载官方 u2netp.onnx 至忽略的 .local/models/ 并校验 MD5；HTTP API /api/garment/cutout 沿用配对/bearer 和 Origin 校验，10MB 内原始图片直传，仅内存处理、无图像日志、一次处理一张；失败可用原图。手机照片会传至运行应用的这台电脑进行处理。
- 抠图检查：本地 CPU 对白色羽绒服参考图输出 931×1600 透明 PNG，用时约1.6秒，存在前景和透明背景；没有调用 Xmax/Decart。实际手机画笔与多窗口相册流程未做浏览器体验。
- 高梵商品：加入瑞锦黑、瑞锦白1号两色长款云锦羽绒服，上衣分类置顶。使用用户所给商详第3/4张长图的正面图，经内置 imagegen 辅助提取；白底 WebP 作为模型参考，透明 PNG 在 outputs/高梵羽绒服抠图。来源、裁剪位置和编辑提示词在 design-assets.md。共21件（上衣10、裤装3、套装4、鞋履4）。
