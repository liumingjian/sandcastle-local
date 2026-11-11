# sandcastle-local

与 Sandcastle 使用相同的安装、初始化和模板执行流程，固定使用 **本机 Codex + macOS Seatbelt**，自动复用本机已有登录。模型由用户选择；其余 issue tracker、template、提示词、循环、审查、并行、分支和合并行为均沿用上游。

**本包版本与所依赖的上游版本严格相同，目前均为 `0.14.0`。** 不使用独立版本号、版本范围或本地版本后缀。

## 安装

前提：macOS 14+、Node.js、npm、Git 和 Codex CLI；宿主终端已能正常使用 `codex`，登录保存在 `auth.json` 中。

直接在目标项目中从 GitHub 安装并初始化，无需手动 clone：

```bash
cd /path/to/your-project
npm install --save-dev git+https://github.com/liumingjian/sandcastle-local.git
npx sandcastle-local init
```

仓库公开提供，HTTPS 安装无需 GitHub 仓库授权。已配置 GitHub SSH key 时也可以使用：

```bash
npm install --save-dev git+ssh://git@github.com/liumingjian/sandcastle-local.git
```

npm 会自动获取仓库、安装构建依赖，并运行本包的 `prepare` 脚本构建。无需手动 clone、单独构建或另外安装上游包。参见 [npm Git 安装说明](https://docs.npmjs.com/cli/v11/using-npm/package-spec/#git-urls)和 [prepare 生命周期](https://docs.npmjs.com/cli/v11/using-npm/scripts/#life-cycle-scripts)。

默认安装远端默认分支；固定某次发布可在 Git 地址后追加已存在的 `#tag` 或 `#commit`，并提交项目生成的 package-lock.json。发布 tag 的版本号应与本包及上游一致。

## 初始化

```bash
npx sandcastle-local init
```

初始化器直接调用同版本上游 CLI，已固定 Codex 和 Seatbelt，因此跳过这两项选择。其余交互沿用上游，包括：

- 选择 issue tracker：GitHub Issues、Beads 或 Custom。
- 选择 template：blank、simple-loop、sequential-reviewer、parallel-planner 或 parallel-planner-with-review。
- 按上游流程确认 GitHub 标签创建、模板依赖安装等操作。

生成的 `.sandcastle/main.mts`（或 `.ts`）会自动接入本机登录和按需启动的宿主浏览器桥接。提示词保留上游内容，并追加 `.sandcastle/BROWSER.md` 的浏览器使用指引。审查标准、tracker 配置和任务编排沿用上游。`.env.example` 仅移除 Codex API key 要求；GitHub 等 tracker 的认证要求保持不变。

非交互式初始化沿用上游参数，例如：

```bash
npx sandcastle-local init   --template simple-loop   --issue-tracker github-issues   --create-label false
```

需要 schema validator 的 planner 模板，在非交互模式下还需按上游要求指定 `--install-template-deps true` 或 `false`。`--model MODEL` 沿用上游含义；省略时保留上游模板默认模型，本包不强制指定模型。

可使用 `npx sandcastle-local init --help` 查看选项。`--agent codex` 和 `--sandbox seatbelt` 可显式传入，其他 agent/sandbox 值会被拒绝。已有 `.sandcastle/` 时沿用上游拒绝重新初始化的行为，不覆盖现有脚本。

### 手动选择 Codex 模型

**首次运行前，请打开生成的 `.sandcastle/main.mts`（或 `.ts`），手动检查并修改所有 `codex("模型名")` 调用。** 上游默认模型未必适用于当前账户。本机已验证可用的模型示例：

```ts
agent: sandcastle.codex("gpt-6.1-sol"),
```

如果模板使用具名导入，对应写法是 `agent: codex("gpt-6.1-sol")`。包含 planner、implementer、reviewer、merge 等多个角色的模板，需要逐个检查模型；它们可以按需使用不同模型。

也可以在首次初始化时显式传入 `--model gpt-6.1-sol`。已有脚本需手动编辑，重新运行 init 不会覆盖它。修改宿主 Codex 的默认模型也不会覆盖脚本中显式传入的模型。

## 执行任务

请从项目根目录执行。上游运行器要求 Git 仓库已有至少一次提交；仅执行 `git init` 还不够。可用 `git rev-parse --verify HEAD` 检查。

如果新仓库尚无首次提交，先检查 `.gitignore`（至少忽略 `node_modules/`、`.env` 等本地文件），再选择需要纳入版本控制的项目文件并提交。也可以先建立空提交：

```bash
git commit --allow-empty -m "Initial commit"
```

此命令也会提交已暂存的文件，执行前可用 `git diff --cached --stat` 检查。尚未初始化 Git 的目录需先执行 `git init`。

否则，上游可能报 `WorktreeError: fatal: ambiguous argument 'HEAD'` 或 `invalid reference: HEAD`。这是 Git 基线缺失，错误发生在 Codex 启动前。本包不会自动创建提交；完成首次提交后重新运行即可。使用独立 worktree 的模板还需将任务所需的项目文件提交到 Git，未跟踪文件不会自动进入 worktree。

按照初始化输出配置 tracker、提示词和项目脚本，然后执行，例如：

```bash
npx tsx .sandcastle/main.mts
```

若上游生成 `.sandcastle/main.ts`，使用对应文件名。也可按上游提示添加 package.json 的 `sandcastle` 脚本，再运行 `npm run sandcastle`。

执行使用上游原生 API。本包适配 Codex/Seatbelt provider 的登录目录、会话路径和浏览器桥接环境变量，由生成入口管理宿主浏览器生命周期。分支、轮次、hook、任务超时、审查、并行或合并策略仍由上游控制。Seatbelt 没有显式分支策略时，会按照上游默认行为直接在当前检出目录执行。

## 登录检查

```bash
npx sandcastle-local doctor
npx sandcastle-local doctor --offline
npx sandcastle-local --version
```

`doctor` 默认在临时 Git 项目中通过 Seatbelt 发起一个最小模型请求验证登录，消耗少量当前账户额度，最长等待约两分钟；不会发送业务项目内容。`--offline` 只检查本地配置，不发送请求。

```text
sandcastle-local doctor [--offline] [--codex-home PATH] [--model MODEL]
```

在线验证收到随机标记后返回 `auth.status: "verified"`；失败时返回非零退出码和分类错误，不打印原始服务端错误。成功只代表该次请求可用。doctor 的默认模型读取宿主配置，与初始化时的上游默认模型选择相互独立。

## 登录适配边界

- 登录目录按显式 `codexHome`（doctor 可用 `--codex-home`）、宿主 `CODEX_HOME`、`~/.codex` 的顺序选择。生成脚本在运行时解析当前用户的目录，不写入初始化机器的绝对路径。
- 整个选定目录在 Seatbelt 内可读写，包括配置、凭证和会话。Codex 自己管理 token 刷新，无需复制凭证或额外回写。
- `CODEX_HOME/skills` 中指向外部的符号链接会自动解析，并将真实目标以只读方式放行，包括技能内的嵌套链接。只放行链接的真实目标，不额外放行其所在仓库的其他目录；指向整个用户目录或其父目录的链接会被拒绝。断开的链接会跳过，循环链接不会重复遍历，修改链接后需重新启动脚本。
- 仅支持已有 `auth.json` 文件登录，`cli_auth_credentials_store` 为 `file` 或未设置。不自动迁移登录、不修改宿主配置、不额外注入 API key。
- 保留上游 Codex 选项和 Seatbelt 的原有环境变量、挂载与输出配置。默认会话路径对齐至选定登录目录的 sessions；显式 sessionStorage 配置保留。
- 上游私有 HOME、网络和 `.sandcastle/.env` 处理逻辑保持原样。不要在 agent env 中重复定义 CODEX_HOME；上游禁止 agent/sandbox provider 的 env 键重叠。
- 不支持 Keychain-only 登录或其他系统；不可用时明确报错，不降级为无沙箱执行。

### Codex 启动失败排查

`failed to scan skill path ... Operation not permitted` 表示技能链接的目标未获得读取权限。当前适配器会自动放行 `CODEX_HOME/skills` 的外部链接目标；已安装旧版的项目需要更新适配器。

技能扫描错误不一定导致 Codex 退出。上游 `codex exited with code 1` 只展示 stderr，可能遗漏 JSON stdout 中的 `error` / `turn.failed`。可使用当前模板的模型运行最小请求，查看实际错误：

```bash
printf '%s' 'Reply exactly OK. Do not use tools.' | codex exec --json -m gpt-6.1-sol
```

例如服务返回 `429 Too Many Requests` 时，需要检查该模型的额度、可用性和限流，或将 `.sandcastle/main.mts` 中的模型改为当前账户已验证可用的模型。模板显式传入的模型优先于宿主配置；仅修改宿主默认模型不会改变现有模板。

### Chromium / Playwright 启动失败排查

若 Chromium 报 `bootstrap_check_in ... MachPortRendezvousServer ... Permission denied (1100)`，先区分宿主与 Seatbelt 内的启动结果。本机已复现：同一个 Chromium 在宿主正常启动，在上游 `seatbelt()` 内失败，即使浏览器文件已经只读挂载到沙箱。该错误发生在 Chromium 注册 Mach 服务时；把浏览器复制到工作区、修改文件执行权限或添加 `--no-sandbox` 都不能补充外层 Seatbelt 的 Mach 权限。本机已验证 `--no-sandbox` 仍失败。

脚手架现在通过宿主浏览器桥接解决此问题：生成入口使用 `await using` 管理服务，首次连接时才启动独立 Chromium，沙箱内通过 `connectBrowser()` 运行浏览器旅程。任务正常结束或抛错时关闭服务与浏览器，无需手动启动调试端口。

**已有项目**：先更新已安装的本包，再在项目根目录执行：

```bash
npx sandcastle-local setup-browser
npx playwright-core install chromium
npx tsx .sandcastle/main.mts
```

`setup-browser` 可重复执行，默认检查 `.sandcastle/main.mts`、`.sandcastle/main.ts` 和根目录 `main.mts`、`main.ts`，为其中使用本机 providers 的入口补充桥接启动代码，并打印实际修改范围。其他入口使用 `npx sandcastle-local setup-browser --entry path/to/entry.mts`。重启时请使用实际运行的入口。

初始化和迁移也会在模板的 `copyToWorktree` 数组中加入 `.sandcastle/BROWSER.md`，确保 `.sandcastle/` 被 Git 忽略时，独立 worktree 仍能读取说明。不会复制整个 `.sandcastle/` 或其中的 `.env`。新初始化的项目已自动接入，只需在首次使用浏览器前于宿主运行 `npx playwright-core install chromium`；也可设置宿主 `BROWSER_EXECUTABLE_PATH` 指向已有 Chromium。普通任务不需要安装或启动浏览器。

浏览器测试使用包内统一版本的客户端，避免宿主与沙箱的 Playwright 协议版本不匹配：

```ts
import { connectBrowser } from "@liumingjian/sandcastle-local/browser";

const browser = await connectBrowser();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Run the project's browser journey and screenshot assertions here.
  await context.close();
} finally {
  await browser.close();
}
```

Playwright Test 可通过自定义 `browser` fixture 调用此 helper；已有 `chromium.launch()` 脚本需改用 `connectBrowser()`。每个并行测试使用独立 context。桥接地址通过 `SANDCASTLE_BROWSER_ENDPOINT` 注入 Seatbelt，服务仅监听 localhost，浏览器使用独立临时 profile。浏览器在宿主执行，文件访问遵循宿主权限；沙箱里的客户端仍遵循原有 Seatbelt 策略。项目仍需执行自己的旅程和截图基线比较。验证细节见 [验证记录](docs/verification.md#chromium-under-seatbelt)。

## 版本与开发

只有开发本仓库时才需要手动 clone：

```bash
git clone git@github.com:liumingjian/sandcastle-local.git
cd sandcastle-local
npm ci
```

```bash
npm run check
```

构建和 CI 强制校验：本包 version、精确上游依赖、实际安装的上游版本，以及 lockfile 中的对应版本必须全部相同。CLI 启动时也检查版本匹配。

升级时一起更新本包版本和上游依赖，例如在本仓库执行：

```bash
npm version NEW_VERSION --no-git-tag-version
npm install --save-exact @ai-hero/sandcastle@NEW_VERSION
npm run check
```

将 `NEW_VERSION` 替换为同一个上游发布版本。通过模板兼容性验证后再发布同版本适配包。版本不会自动升级，也不宣称未经验证的新版本兼容。

检查包含全部模板与 tracker 组合的内容对比、初始化后直接运行、真实 Seatbelt 文件边界、登录持久化、迭代、提示词展开、hook 和会话恢复，不消耗模型额度。非 macOS 环境只验证通用检查和拒绝行为。

需要真实本机 CLI 与登录验证请求和恢复时，运行 `npm run test:live`；此命令会消耗当前账户额度，并保存验证会话。

更多说明：[设计范围](docs/design.md)、[验证记录](docs/verification.md)。
