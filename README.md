# 智绘全屋

多页面版全屋定制 AI 创作平台。首页只负责创作入口和模块导航，点击模块会进入独立页面。前端可部署到 GitHub Pages，后端 API 使用 Vercel Serverless。

## 页面结构

- `index.html`：首页，居中创作框、功能卡片、会员入口。
- `floorplan.html`：户型生图，上传户型平面图后选择风格、区域、数量和比例生成效果图。
- `text-image.html`：文本生图，输入提示词后选择风格、区域、数量和比例生成效果图。
- `video.html`：视频剪辑，上传图片，拼接视频，添加字幕和背景音乐。
- `pricing.html`：会员和充值，包含微信支付、支付宝、企业版入口。
- `assets.html`：资产库，展示生成的图片和视频。

## Logo

页面引用同目录下的 `image.png`。请把正式 Logo 图片保存为：

```text
D:\AI编程\全屋定制\image.png
```

## 生成接口

图片生成通过 Vercel 后端代理调用 GPT-Image-2：

- `POST /api/upload`：上传户型图到阿里 OSS，返回公网 URL。
- `POST /api/generate-image`：提交生图任务。
- `GET /api/task-detail?id=任务ID`：查询任务结果。

为了避免前端泄露密钥，代码未把真实 API key 写死在页面里。请在 Vercel 环境变量中配置。

## Vercel 环境变量

在 Vercel 项目 Settings -> Environment Variables 中添加：

```text
WUYIN_API_KEY=之前提供的速创API密钥
ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_BUCKET=你的Bucket名称
ALI_OSS_ACCESS_KEY_ID=你的阿里云AccessKeyId
ALI_OSS_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
ALI_OSS_PUBLIC_BASE_URL=https://你的Bucket公网域名
ALLOWED_ORIGIN=https://laiyinhe-2026.github.io
```

## GitHub Pages + Vercel

1. 把代码推送到 `https://github.com/laiyinhe-2026/quanwudingzhi.git`。
2. 在 GitHub 仓库 Settings -> Pages 中选择 GitHub Actions。
3. 在 Vercel 导入同一个 GitHub 仓库，框架选择 Other。
4. Vercel 部署完成后，把 `config.js` 中的地址改成你的 Vercel 域名：

```js
window.ZHIHUI_API_BASE = "https://你的项目.vercel.app";
```

如果直接使用 Vercel 访问整站，`config.js` 可以保持空字符串。

## 商用待接入

- 用户登录、积分账户、会员状态。
- 真实支付订单、回调验签和积分入账。
- 视频剪辑后端任务、字幕、音乐、成片存储。
