# Simple File Manager

本项目是基于 [kira-live/Shorturl-CloudFlare](https://github.com/kira-live/Shorturl-CloudFlare.git) 二次开发而来。

这是一个简化版 Cloudflare 文件管理器。

## 部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/CoronaAustralis/CFSimpleFileManager.git)


## 最简单使用

1. 安装依赖
```bash
pnpm install
```

2. 在 `wrangler.jsonc` 里填好你自己的 D1 和 R2 绑定
3. 设置管理员密码
```bash
pnpm wrangler secret put ADMIN_PASSWORD
```

4. 本地开发
```bash
pnpm dev
```

5. 部署
```bash
pnpm wrangler deploy
```

- 默认用户名固定为 `admin`
- 存储桶列表直接读取 `wrangler.jsonc`
- 网页登录后可以查看 Token，给 `curl` 或脚本上传下载使用
