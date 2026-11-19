<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>为你自己的服务器<br>准备的主机面板。</h1>

<h3>
站点、域名、备份和 staging，都在浏览器里完成。基于 PanelAlpha Engine 运行。
</h3>

<h3>
<a href="#让面板跑起来"><b>开始使用</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>文档</b></a> ·
<a href="#在-discord-上找我们"><b>Discord</b></a>
</h3>

<p>
<a href="#在哪里找到各项功能">面板内</a> ·
<a href="#连接你的-ai-助手">连接 AI</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <a href="README.de.md">Deutsch</a>
· <a href="README.nl.md">Nederlands</a>
· <a href="README.es.md">Español</a>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <b>简体中文</b>
</p>

<p>
<a href="#第-1-步在自己的-vps-上安装面板"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="需要 PanelAlpha Engine 2.3.0 或更高版本"></a>
<a href="#第-1-步在自己的-vps-上安装面板"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="支持的系统"></a>
<a href="#许可证"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="加入 Discord"></a>
</p>

</div>

---

## 什么是 PanelAlpha Single Server Edition？

PanelAlpha Single Server Edition 是安装在你自己 VPS 上的网站托管面板。你在浏览器里打开它，在那里管理站点：WordPress、来自 Git 的应用、域名、备份等。底层的托管由 PanelAlpha Engine 完成，面板为它提供一个操作界面。

Community 版供一个人使用，项目数量没有上限。在面板中你可以：

- 创建 WordPress 站点，从 Git 或文件部署应用，或从 PanelAlpha GO! 目录安装经过测试的应用
- 从其他主机导入 WordPress 站点
- 添加域名，证书由 Let's Encrypt 签发
- 手动或按计划备份，并恢复备份
- 为站点保留一份 staging 副本，并推送到线上
- 管理数据库、cron 任务、FTP 和 SFTP 账户以及 PHP 设置
- 查看访客统计、资源用量和日志
- 连接 AI 助手，通过聊天管理你的项目
- 把服务器连接到你的 PanelAlpha Hub 账户，并用它登录

## 工作原理

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="面板导览：从 PanelAlpha GO! 创建项目、项目页面、staging 与 Push To Live，以及 Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">观看完整导览（2.5 分钟，MP4）</a></div>

面板是引擎上的一个项目，运行在它自己的容器里。你创建站点时，面板请求引擎 API 去做，引擎再为该站点建立独立的项目。删除面板只会删除面板自己的项目。你的站点继续运行。

## 为什么使用面板

PanelAlpha Engine 可以通过 AI 助手，或服务器上的 `pae` 命令来操作。面板把同样的工作放到了屏幕上。点几下就能添加域名、恢复备份，或把 staging 副本推送到线上，服务器上的所有站点也都在同一个列表里。想让助手帮忙时，把它连接到面板，它就在同样的项目上工作。

## 让面板跑起来

### 第 1 步：在自己的 VPS 上安装面板

你需要一台全新的服务器，系统为 Debian 12/13 或 Ubuntu 22.04/24.04/26.04，内存 2 GB，可通过 SSH 使用 `root` 权限，并有一个指向它的域名。**端口 80 必须对所有人开放**，因为 Let's Encrypt 会使用它。

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

所有选项以及面板所需的 Engine 版本：[Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install)。

### 第 2 步：登录

打开 `https://panel.example.com`。设置向导会创建你的账户，或连接你的 PanelAlpha Hub 账户，然后打开面板：[First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login)。

### 第 3 步：创建第一个站点

进入 **My Projects**，选择 **Create First Project**，然后选 **WordPress**、**Git**、**Files** 或 **PanelAlpha GO!**。你也可以把 `.zip` 或 `.tar.gz` 压缩包直接拖到项目列表上：[Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project)。

**PanelAlpha GO!** 是一个开源应用目录，这些应用都由 PanelAlpha 在 PanelAlpha Engine 上部署并测试过。你选一个应用，面板就会安装它，不需要再填写别的内容。面板连接到 [PanelAlpha Hub](#panelalpha-hub) 后才会显示这个目录。

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress，或引擎能从 Git 仓库或文件夹构建的任何应用。
</div>

## 在哪里找到各项功能

在项目上选择 **Manage** 即可打开它。它的标签页有 **Project Details**、**Monitoring**、**Backups**、**Plugins** 和 **Advanced**。**Plugins** 只在 WordPress 站点上显示。

| 你想要 | 在面板中 |
|:---|:---|
| 给站点绑定自己的域名 | **Advanced > Domains**，然后 **Add Domain** |
| 做一次备份，或按计划备份 | **Backups** 标签页。先在 **Settings > Backups** 中设置一次存储 |
| 在上线之前试一下改动 | 项目顶栏中的 **Staging**，然后 **Push To Live** |
| 每次 git push 都重新部署 | **Advanced > Git**，然后 **Auto-deploy on push** |
| 把 WordPress 站点从其他主机迁过来 | 创建项目，**WordPress**，然后 **Import Existing WordPress Project** |
| 添加数据库和对应的用户 | **Advanced > MySQL Databases** |
| 给某人 SFTP 访问权限 | **Advanced > SFTP Accounts** |
| 按计划运行脚本 | **Advanced > Cron Jobs** |
| 更改 PHP 版本或 `memory_limit` | **Advanced > Developer Settings** |
| 查看有多少人访问 | **Monitoring** 标签页 |

## 站点需要的一切，都在面板里

- **域名和 HTTPS。** 把自己的域名指向站点，添加更多域名和重定向，并为每个域名配置 Let's Encrypt 证书。还没有域名时，如果你的服务器提供免费子域名，可以先用它。[Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **可以恢复的备份。** 手动备份，或按每天、每周、每月备份到 S3、SFTP、FTP、FTPS 或本地文件夹。在 WordPress 站点上，可以分别恢复文件和数据库。[Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging。** 为站点做一份副本，在那里试改动，然后把文件、完整数据库或选定的表推送到线上站点。Git 项目可以把某个分支部署到 staging，而不动 production。[Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git。** 查看站点落后多少个提交，重新部署，切换分支，并实时查看部署日志。开启自动部署后，向 GitHub、GitLab 或 Bitbucket 推送就会重新部署站点。[Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress。** 免密码登录后台，更新 WordPress 和 WooCommerce，按 wordpress.org 上的名称安装插件和主题，管理 WordPress 用户，并开启自动更新。[Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **文件、FTP 和 SFTP。** 在文件管理器中编辑、上传、压缩和解压文件，或给 FileZilla 这类程序一个 FTP 或 SFTP 账户。[Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **数据库。** 创建 MySQL 数据库和用户，设置权限，并直接从面板打开 phpMyAdmin。[Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **统计和日志。** 按国家、来源和设备统计的访问量，带宽，整台服务器的 CPU、内存和磁盘，以及每个站点的 PHP 和 Web 服务器日志。[Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## 连接你的 AI 助手

你在面板中连接助手，入口是顶部菜单里的 **Connect AI** 页面。

1. 打开 **Connect AI**，在 **Your tool** 下选择你的工具。
2. 在 **Generate an MCP token** 下选择 **Create Token**，起一个名字，例如 `Claude on my laptop`，然后复制令牌。**令牌只显示一次。**
3. 下一步会显示要填进工具的内容，你的面板地址已经填好。选择 **Copy**，粘贴到你的工具里，并把 `YOUR_TOKEN` 换成你的令牌。
4. 按同一页面上的 **Verify the connection** 操作。在 Claude Code 中，重启它或运行 `/mcp`。

然后在聊天里提出要求，例如 `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

这些工具在 **Connect AI** 中各有一个页面，**Other tool** 涵盖其他任何支持 MCP 的工具。助手可以访问你的线上项目和 staging 项目。它不能更改服务器范围的设置、更改项目的限额、暂停项目，也不能动面板自己的项目。**MCP URL & tokens** 列出你的令牌，并可以吊销其中任何一个，**Activity Log** 显示每一个请求：[Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai)。

## PanelAlpha Hub

PanelAlpha Hub 是你在 [hub.panelalpha.com](https://hub.panelalpha.com) 上的 PanelAlpha 账户。把面板连接到它是免费的，也是可选的。无论连不连接，面板都能独立工作。

面板连接后：

- 你用 **Sign in with PanelAlpha** 登录面板，你的 Hub 账户可以通过 GitHub 或 Google 登录
- 一个账户涵盖你所有的服务器
- 你可以从 PanelAlpha GO! 目录安装应用
- Hub 显示这台服务器上每个站点的状态

连接有两个入口。首次登录时，在设置向导的 **Sign in** 步骤中选择 **Connect with Hub**，而不是本地账户。对于已经设置好的面板，打开 **Settings** 并选择 **Connect to PanelAlpha**。无论哪种方式，你都在 PanelAlpha 上登录，然后直接回到面板。

连接期间，面板每五分钟向 Hub 报告一次：每个项目的名称、类型和状态，面板的版本及其地址。**通过 PanelAlpha 登录会跳过面板的双重验证。** 通过 Hub 登录就算作这次验证。

**Settings** 中的 **Disconnect** 会把服务器从你的账户中移除，并关闭 **Sign in with PanelAlpha**。如果 PanelAlpha 是你唯一的登录方式，请先在 **My Account** 中设置密码：[Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub)。

## 站点如何相互隔离

每个站点都是引擎上的独立项目，有自己的文件、数据库、域名和备份。由 Git 或文件创建的站点运行在各自的容器中，所以一个出问题的应用不会拖垮其他站点。

面板也是一个项目。一旦它的项目被保护，面板和任何令牌都不能删除、停止或重新部署它。只有服务器上的 `pae` 可以。删除面板后，所有站点继续运行。

你自己的登录可以开启双重验证，**Active Devices** 让你可以退出不再使用的浏览器：[Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account)。

## 出问题时怎么办

面板做的大部分事情都在后台运行：部署、备份、staging 副本。用户菜单中的 **Tasks** 列出每一项任务的状态和耗时，有任务运行时会显示一个圆点。失败的任务会在名称下方显示其错误的第一行。选择该行可以阅读完整错误：[Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks)。

对于 Git 或文件站点，**Show Logs** 会打开部署日志，可以看实时的，也可以看以前部署的。**Advanced > Logs** 有 PHP 和 Web 服务器日志，**Advanced > Containers** 可以启动、停止或重启单个服务。文档的每个部分都有一个 Troubleshooting 页面，列出你看到的消息、它的含义，以及该怎么做：[Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account)。

## FAQ

<details>
<summary><b>我需要 PanelAlpha Engine 吗？</b></summary>

需要。面板是引擎上的一个项目，每一项托管操作都经过引擎 API。它需要 Engine 2.3.0 或更高版本：[Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements)。
</details>

<details>
<summary><b>一个面板可以管理多台服务器吗？</b></summary>

不可以。一个面板只管理它所在的引擎。用一个面板管理多个引擎是 Multi Server，是另一个产品。
</details>

<details>
<summary><b>如果我删除面板，我的站点会怎样？</b></summary>

它们继续运行。删除面板会删除它自己的项目和数据：账户、设置、项目标签和活动日志。每个站点都是引擎上的独立项目：[Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing)。
</details>

<details>
<summary><b>面板会备份它自己吗？</b></summary>

不会。你在面板中设置的备份只覆盖你的站点。请在服务器上用 `pae project:backup:create` 备份面板：[Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel)。
</details>

<details>
<summary><b>如何更新面板？</b></summary>

把新版本部署到服务器上面板的项目中。没有更新按钮。你的账户、设置和会话都会保留，面板在启动时更新它的数据库：[Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating)。
</details>

<details>
<summary><b>可以把面板迁到另一个地址吗？</b></summary>

可以。把新域名指向服务器，然后在 **Settings** 中把它保存为 **Application URL**。面板会添加该域名、获取证书并迁移过去。旧地址不再响应：[The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address)。
</details>

<details>
<summary><b>我可以把其他主机上的 WordPress 站点迁过来吗？</b></summary>

可以。创建项目，选择 **WordPress**，然后选择 **Import Existing WordPress Project**。面板使用你的 WordPress 管理员登录信息连接，或通过你装在旧站点上的插件连接。不支持通过 FTP 或 SFTP 导入：[Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress)。
</details>

<details>
<summary><b>面板目前还不能做什么？</b></summary>

它不能把 Git 项目回滚到更早的提交，因为它部署的是分支的最新提交。它没有给整个站点加密码的设置。插件和主题按 wordpress.org 上的名称安装，不能通过 URL 安装。
</details>

<details>
<summary><b>它是免费的吗？</b></summary>

Single Server Community 免费，以 Apache 2.0 许可证开源，项目数量没有上限。你只需为自己的服务器付费。
</details>

## 在 Discord 上找我们

[Discord](https://discord.gg/9twHWR7xGX) 是联系 PanelAlpha 团队的主要地方。你可以提问，告诉我们哪里出了问题，或者展示你托管的内容。

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="在 Discord 上找我们，这是联系 PanelAlpha 团队的主要地方" width="760">
</a>
</div><br>

如果你更喜欢论坛，请使用 [community.panelalpha.com](https://community.panelalpha.com/)。

## 安全

请私下报告漏洞，不要发在公开的 issue 里：[manage.panelalpha.com/contact](https://manage.panelalpha.com/contact)。

## 许可证

PanelAlpha Single Server Edition 以 [Apache License 2.0](../../LICENSE) 开源。
