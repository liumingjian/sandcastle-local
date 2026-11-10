# sandcastle-local

为本地 Codex CLI 添加 Sandcastle 的 macOS Seatbelt 编排，并复用宿主机已有的文件登录。适合将单个开发任务放进独立 Git 分支执行，再由你检查和合并。

这是一个独立适配层，通过 npm 使用上游包，不修改 `node_modules`。更新 Sandcastle 不会覆盖适配代码。

## 支持范围

| 项目 | 首版支持 |
| --- | --- |
| 系统 | macOS 14+，与上游 Seatbelt 要求一致 |
| 隔离 | 系统 `/usr/bin/sandbox-exec`，无需 Docker |
| Agent | 宿主 PATH 中的 Codex CLI |
| 授权 | 已有 `auth.json` 文件登录；无需额外提供 API key |
| 执行方式 | 非交互任务、显式命名分支、会话捕获与恢复 |
| 暂不支持 | Windows、WSL、Linux、Keychain-only 登录、交互终端、其他 agent |

上游依赖精确固定为 `@ai-hero/sandcastle@0.14.0`。上游未声明统一的 Node `engines`，本项目也不额外声明不同的版本要求；开发与 CI 使用 Node 22/24，首次在本机验证使用 Node 24。

## 快速开始

前提：安装 Node.js、npm、Git 和 Codex CLI，且宿主终端已经可以正常使用 `codex`。目标项目必须有至少一次 Git 提交。

```bash
git clone git@github.com:liumingjian/sandcastle-local.git
cd sandcastle-local
npm ci
node dist/cli.js doctor
```

`doctor` 检查系统沙箱可用性、CLI、文件登录和模型配置；成功时输出 JSON。它不向模型发送请求，也不证明登录尚未过期。

接着指定你自己的目标项目，先跑一个不改文件的任务：

```bash
node dist/cli.js run \
  --cwd /path/to/your-git-project \
  --branch agent/local-first \
  --prompt '只阅读 README 并概括项目用途，不修改文件，不运行外部服务。'
```

模型默认读取宿主 `config.toml` 的顶层 `model`，也可以显式传入 `--model`。成功后输出 branch、commits、sessions 和 logFilePath。需要修改代码时，在任务中明确验收命令与提交要求；`commits` 只收集 agent 实际创建的提交。

结果留在指定分支，不自动合并到当前分支。检查日志和 diff，在目标分支/worktree 运行项目检查，再决定是否合并。`.sandcastle/worktrees/` 中的运行目录由上游管理；查看位置可使用 `git worktree list`。目标项目应将 `.sandcastle/` 加入 `.gitignore`。

### 命令选项

```text
sandcastle-local doctor [--codex-home PATH] [--model MODEL]
sandcastle-local run --branch BRANCH (--prompt TEXT | --prompt-file PATH)
  [--cwd PATH] [--model MODEL] [--effort high] [--codex-home PATH]
```

`--prompt-file` 按目标项目目录解析，作为普通文本读取，不展开 Sandcastle 的 shell 模板语法。CLI 一次执行一轮，最多运行 30 分钟；Ctrl-C 会取消任务。`--effort` 支持 low、medium、high、xhigh，与上游 0.14.0 发布包保持一致。

需要直接使用命令名时，可在本仓库执行 `npm link`。也可以在另一个项目中通过本地路径安装此包：

```bash
npm install --save-dev /absolute/path/to/sandcastle-local
npx sandcastle-local doctor
```

## 在脚本中编排

```ts
import { run } from '@ai-hero/sandcastle';
import { codexOnSeatbelt, assertLocalRunEnvironment } from '@liumingjian/sandcastle-local';

const cwd = '/path/to/your-git-project';
await assertLocalRunEnvironment(cwd);
const { agent, sandbox } = await codexOnSeatbelt({ effort: 'high' });

const result = await run({
  cwd,
  agent,
  sandbox,
  branchStrategy: { type: 'branch', branch: 'agent/my-task' },
  prompt: '完成指定任务，运行项目检查并提交本次修改。',
});
```

helper 返回上游原生的 agent/sandbox，可与 `run()`、`createSandbox()` 组合。**脚本调用者仍须显式选择分支策略**；CLI 则强制要求 `--branch`。并行任务必须使用不同分支；运行完成或 agent 报告完成，不等于项目验收已通过。

## 登录和隔离边界

- Codex 目录按 `codexHome` / `--codex-home`、宿主 `CODEX_HOME`、`~/.codex` 的顺序选择，并解析为真实路径。
- 整个指定 Codex 目录在 Seatbelt 内可读写，包括配置、凭证和会话。Codex 自己保存 token 刷新结果，无需复制凭证或额外回写。
- 沙箱仍使用私有 HOME，其他未开放的宿主目录继续受 Seatbelt 策略限制。该模式沿用上游开放网络的行为，包括宿主 localhost。
- 首版接受未设置或设置为 `file` 的 `cli_auth_credentials_store`；其他存储模式会明确报错，不自动迁移授权或修改宿主配置。
- `auth.json` 可以来自已有 ChatGPT 登录或已有 API 登录。本适配器不切换登录方式、不承诺具体订阅额度，不额外注入 API key。
- CLI 拒绝目标项目 `.sandcastle/.env` 中的 `CODEX_API_KEY`、`OPENAI_API_KEY`、`CODEX_HOME`。脚本集成请调用 `assertLocalRunEnvironment(cwd)` 做同样检查。
- 宿主 shell 的全部环境变量不会自动透传。若自定义 provider 还依赖其他环境变量，需按上游 `.sandcastle/.env` 机制显式配置。

## 开发与升级

```bash
npm ci
npm run check
```

检查包括类型、真实 Seatbelt 文件访问边界、持久化写入，以及测试 CLI 下的提交、会话恢复和双分支并行，不消耗模型额度。非 macOS 环境只验证拒绝行为与通用检查，不能作为 Seatbelt 验收。

如需使用自己的真实 CLI 和已有登录做两个最小请求：

```bash
npm run test:live
```

此命令会消耗当前 CLI 账户额度，在临时 Git 项目运行一次任务和一次 resume；不会修改业务项目。它会在已有 Codex 目录保存验证会话。

升级依赖时显式选择新版本，并提交 lockfile：

```bash
npm install --save-exact @ai-hero/sandcastle@<new-version>
npm run check
npm run test:live
```

新版本通过验证后再提交。升级不会覆盖本项目源码，但上游公开接口变化仍可能需要适配。

更多说明：[设计与批准范围](docs/design.md)、[验证记录](docs/verification.md)。
