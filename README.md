# picgo-plugin-codeberg-uploader

[PicGo](https://github.com/Molunerfinn/PicGo) 桌面端的 [Codeberg](https://codeberg.org) 图床上传插件。

[![npm version](https://img.shields.io/npm/v/picgo-plugin-codeberg-uploader.svg)](https://www.npmjs.com/package/picgo-plugin-codeberg-uploader)

基于 [picgo-plugin-gitee-uploader](https://github.com/lizhuangs/picgo-plugin-gitee-uploader) 架构移植，适配 Codeberg 的 Forgejo API。

## 功能

- 上传图片到你的 Codeberg 仓库（contents API，POST 创建；重名自动转覆盖更新）
- 直链格式：`https://codeberg.org/{owner}/{repo}/raw/branch/{branch}/{path}/{file}`
- 支持 `$customPath` 按年 / 年季 / 年月自动分目录
- GUI 菜单 **Sync codeberg**：把本地图床记录同步到仓库的 `data.json`
- GUI 菜单 **Pull codeberg**：拉取仓库目录图片清单进本地图床相册
- 在 PicGo 相册删除图片时，同步删除 Codeberg 远端文件（Forgejo 的 DELETE 需要 sha，插件自动维护）

## 准备工作

1. 在 Codeberg 建一个仓库当图床（建议 Public，直链才能免登录访问；Private 仓库的直链需要登录态）
2. 到 `设置 → 应用 → 令牌（Applications → Tokens）` 新建一个 token，**权限必须包含 `repo`（读写）**

## 安装

### 方式一：PicGo 内安装（推荐）

插件已发布到 npm，在 PicGo「设置 → 插件设置」搜索 `picgo-plugin-codeberg-uploader` 安装即可。

也可手动安装：

```bash
# Windows
cd %APPDATA%\picgo && npm install picgo-plugin-codeberg-uploader

# macOS / Linux
cd ~/.config/picgo && npm install picgo-plugin-codeberg-uploader
```

### 方式二：解压即用（免联网）

下载 [GitHub Releases](https://github.com/stxttkx/picgo-plugin-codeberg-uploader/releases) 中的 `picgo-plugin-codeberg-uploader-v1.0.0.zip`，解压后把 `picgo-plugin-codeberg-uploader` 整个目录（目录名不能改）放进 PicGo 的数据目录：

- Windows：`%APPDATA%\picgo\node_modules\`
- macOS / Linux：`~/.config/picgo/node_modules/`

重启 PicGo，在「图床设置」里就会出现 **Codeberg**。

## 配置说明

| 配置项 | 说明 | 示例 |
|--------|------|------|
| repo | 仓库 `owner/repo` | `myname/picbed` |
| branch | 分支，留空默认 `main` | `main` |
| token | Codeberg access token（需 repo 读写权限） | |
| path | 图片存放目录 | `img` |
| customPath | `default` / `year` / `yearQuarter` / `yearMonth`，追加时间子目录 | `yearMonth` → `img/2026/11` |
| customUrl | 自定义访问域名（有 CDN/镜像时填写，留空用官方 raw 直链） | |

## 使用

1. PicGo「设定」→ 上传服务设为 Codeberg
2. 拖拽 / 剪贴板上传即可
3. 多设备同步：在相册右键菜单使用 **Sync codeberg** / **Pull codeberg**

## 开发

```bash
npm install        # 安装依赖
npm run build      # 编译到 dist/
```

## 说明

- Forgejo API 与 GitHub 不同：创建文件是 **POST**（GitHub 是 PUT）、删除要带 JSON body（sha+branch）、认证头是 `Authorization: token <PAT>`。
- 本插件与 [picgo-plugin-gitcode-uploader](../picgo-plugin-gitcode-uploader) 可同时安装、互不冲突（uploader 名称分别为 `codeberg` / `gitcode`）。
- License: MIT
