# sandcastle-local

与 Sandcastle 使用相同的安装、初始化和模板执行流程，固定使用 **本机 Codex + macOS Seatbelt**，自动复用本机已有登录。其余 issue tracker、template、提示词、循环、审查、并行、分支和合并行为均沿用上游。

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

生成的 `.sandcastle/main.mts`（或 `.ts`）会自动接入本机登录。提示词、审查标准、tracker 配置和任务编排保留上游内容，不需要手动修改登录代码。`.env.example` 仅移除 Codex API key 要求；GitHub 等 tracker 的认证要求保持不变。

非交互式初始化沿用上游参数，例如：

```bash
npx sandcastle-local init   --template simple-loop   --issue-tracker github-issues   --create-label false
```

需要 schema validator 的 planner 模板，在非交互模式下还需按上游要求指定 `--install-template-deps true` 或 `false`。`--model` 保留上游含义；省略时使用上游 Codex 默认模型。

可使用 `npx sandcastle-local init --help` 查看选项。`--agent codex` 和 `--sandbox seatbelt` 可显式传入，其他 agent/sandbox 值会被拒绝。已有 `.sandcastle/` 时沿用上游拒绝重新初始化的行为，不覆盖现有脚本。

## 执行任务

按照初始化输出配置 tracker、提示词和项目脚本，然后执行，例如：

```bash
npx tsx .sandcastle/main.mts
```

若上游生成 `.sandcastle/main.ts`，使用对应文件名。也可按上游提示添加 package.json 的 `sandcastle` 脚本，再运行 `npm run sandcastle`。

执行使用上游原生 API。本包只适配 Codex/Seatbelt provider 的登录目录和会话路径，不添加任务 `run` 命令，不决定分支、轮次、hook、超时、审查、并行或合并策略。Seatbelt 没有显式分支策略时，会按照上游默认行为直接在当前检出目录执行。

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
- 仅支持已有 `auth.json` 文件登录，`cli_auth_credentials_store` 为 `file` 或未设置。不自动迁移登录、不修改宿主配置、不额外注入 API key。
- 保留上游 Codex 选项和 Seatbelt 的原有环境变量、挂载与输出配置。默认会话路径对齐至选定登录目录的 sessions；显式 sessionStorage 配置保留。
- 上游私有 HOME、网络和 `.sandcastle/.env` 处理逻辑保持原样。不要在 agent env 中重复定义 CODEX_HOME；上游禁止 agent/sandbox provider 的 env 键重叠。
- 不支持 Keychain-only 登录或其他系统；不可用时明确报错，不降级为无沙箱执行。

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
