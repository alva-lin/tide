# Tide - 预言机与结算机制

## 1. 预言机选型

### 1.1 选型对比

| 维度 | Pyth Network | Supra Oracle |
|------|-------------|--------------|
| Sui Move 集成复杂度 | 低：`PriceInfoObject` + `Clock` 两个参数 | 高：Pull Oracle 需 20+ 个签名验证参数 |
| DeFi 采用率 | 高 | 中 |
| 价格更新模式 | Pull：客户端从 Hermes 拉取后提交到链上 | Pull/Push 均支持 |
| 文档质量 | 优秀，有完整 Sui 示例 | 一般 |

### 1.2 决策

采用 **Pyth Network** 作为价格源。

---

## 2. Pyth 集成要点

### 2.1 Move 合约侧

```move
use pyth::pyth;
use pyth::price_info::PriceInfoObject;

// 获取价格，验证 feed ID 和时效性
let price_struct = pyth::get_price_no_older_than(price_info_object, clock, max_age);
```

### 2.2 客户端侧（Keeper/前端）

- 从 Pyth Hermes 拉取指定时间戳的价格数据（`GET /v2/updates/price/{publish_time}?ids[]=<feed_id>`）
- 将价格更新数据作为交易参数提交到链上
- Move 合约本身不主动调用 `update_single_price_feed`，由客户端发起

### 2.3 价格时间戳校验

Keeper 拉取的不是"最新价格"，而是对应 UPCOMING 轮 `start_time` 之后的最近价格。合约侧须验证价格时间戳在单向窗口内：

```
price_timestamp = price::get_timestamp(&price_struct)
// 校验 price_timestamp >= upcoming.start_time
// 校验 price_timestamp <= upcoming.start_time + PRICE_TOLERANCE
// 同一价格同时用于本轮收盘和下一轮开盘
// PRICE_TOLERANCE 默认 10_000ms (10秒)
```

单向约束确保 settler 无法选择性提交轮次结束前的有利价格。

### 2.4 合约地址（Sui Testnet）

- State ID: `0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c`
- Wormhole State ID: `0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790`

### 2.5 价格 Feed ID（需根据网络确认）

- SUI/USD: `0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266` (testnet)
- BTC/USD, ETH/USD: 参考 https://docs.pyth.network/price-feeds/price-feeds

---

## 3. 结算机制

### 3.1 权限模型

`settle_and_advance` 为 **permissionless**（任何人可调用）。正常胜负轮次中，调用者从手续费中获得 `settler_reward_bps` 比例的激励（默认 200bps = fee 的 2%），平局/单边/取消轮次无激励。官方 Keeper 作为兜底确保轮次持续推进。

### 3.2 价格时间戳校验

采用**单向约束**，防止 settler 选择性提交有利价格：

```
price_timestamp >= upcoming.start_time
price_timestamp <= upcoming.start_time + price_tolerance_ms
```

- 校验锚定在 `upcoming.start_time`，有 LIVE 轮时等价于 `LIVE.end_time`
- 只接受轮次结束后发布的价格，消除了向前选择攻击窗口
- Pyth 主流币对更新频率约 1-2 秒，10 秒窗口内必定有可用价格
- `price_tolerance_ms` 默认 10_000ms (10秒)，可通过 `update_config` 调整

### 3.3 Keeper 实现

TypeScript 定时脚本（官方兜底 bot），核心逻辑：

1. 定时检查（每轮结束时触发）
2. 从 Pyth Hermes 拉取 **round_end_time 之后最近的价格**（`/v2/updates/price/{round_end_timestamp}`）
3. 构建交易：`pyth.updatePriceFeeds()` + `settle_and_advance()`
4. 签名提交
5. 可在单个 PTB 中批量结算所有市场
