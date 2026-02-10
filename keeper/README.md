# Tide Keeper

自动结算服务，轮询链上 Market 状态并在每轮到期时调用 `settle_and_advance`。

## 本地运行

```bash
cp .env.example .env   # 填入私钥和网络
pnpm install
pnpm keeper            # 启动 keeper 自动结算循环
pnpm cli help          # CLI 手动操作工具
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `SECRET_KEY` | 是 | — | Sui 私钥（`suiprivkey1...` bech32 格式或 base64） |
| `SUI_NETWORK` | 否 | `testnet` | `testnet` / `mainnet` / `devnet` |
| `KEEPER_MARKETS` | 否 | 全部 | 逗号分隔的市场名（如 `SUI_1M,BTC_5M`） |
| `METRICS_PORT` | 否 | `9090` | 健康检查 / metrics HTTP 端口 |

## HTTP 端点

Keeper 启动后在 `METRICS_PORT` 暴露两个端点：

- **`GET /health`** — 返回 `{ status: "ok"|"degraded", uptime, markets }`
- **`GET /metrics`** — 返回每个市场的结算统计（settle/fail/retry 计数、最后结算时间、最后错误）

可用于 Kubernetes liveness/readiness probe 或外部监控。

## Docker 部署

```bash
# 构建镜像
docker build -t tide-keeper .

# 运行
docker run -d \
  --name tide-keeper \
  -e SECRET_KEY=suiprivkey1... \
  -e SUI_NETWORK=testnet \
  -e METRICS_PORT=9090 \
  -p 9090:9090 \
  --restart unless-stopped \
  tide-keeper
```

### 部署要点

1. **私钥安全**：生产环境不要在命令行传 `-e SECRET_KEY=...`，用 Docker secrets、Kubernetes Secret 或 `.env` 文件挂载：
   ```bash
   docker run --env-file .env tide-keeper
   ```

2. **Gas 余额**：keeper 地址需要充足 SUI 支付 gas。每次 settle 约消耗 0.01-0.05 SUI（含 Pyth 更新费用）。建议预留 5+ SUI 并监控余额。

3. **健康检查**：
   ```yaml
   # Kubernetes 示例
   livenessProbe:
     httpGet:
       path: /health
       port: 9090
     periodSeconds: 30
   ```

4. **单实例运行**：同一市场不要部署多个 keeper 实例，否则会重复结算导致交易失败和 gas 浪费。

5. **网络延迟**：keeper 依赖 Pyth Hermes API 获取价格数据，部署节点到 Hermes 端点的网络延迟会影响结算及时性。建议部署在与 Sui fullnode 和 Hermes 网络延迟较低的区域。

6. **日志**：所有日志输出到 stdout，可配合 `docker logs` 或日志收集工具（Loki、CloudWatch 等）使用。
