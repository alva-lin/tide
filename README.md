# Tide

价格涨跌预测竞猜 DApp，部署在 Sui 区块链上。用户对指定币种在固定时间窗口内的价格走势（上涨或下跌）进行预测下注，猜对者按比例瓜分奖池。

> 取名 "Tide"（潮汐）源自价格曲线如潮汐般起伏的特征

## 玩法概述

- 用户选择一个市场（如 SUI/USD），对**下一轮**的价格走势下注
- 每轮持续固定时间（如 5 分钟），以开盘价和收盘价的对比判定涨跌
- 胜方按投注金额比例瓜分整个奖池（扣除手续费后）
- 平局视为全部失败，奖池归协议；单边投注正常结算（按赢家数量判断收费方式）；异常情况由管理员取消轮次，投注者全额退款

## 系统架构

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│     Frontend     │     │   Keeper/Settler │     │    Move Contract     │
│     (React)      │────>│   (TS Script)    │────>│    (Sui on-chain)    │
│                  │     │                  │     │                      │
│ - 投注/领奖       │     │ - 自动结算+推进    │     │ - 核心业务逻辑        │
│ - 价格图表        │     │ - 拉取 Pyth 价格  │     │ - 资金管理            │
│ - 排行榜          │     │                  │     │ - 状态管理            │
└──────────────────┘     └────────┬─────────┘     └──────────────────────┘
                                  │
                           ┌──────▼──────┐
                           │ Pyth Hermes │
                           │  (价格源)    │
                           └─────────────┘
```

## 文档设计

- [合约设计](docs/contract.md) — 对象模型、函数接口、资金流、边界情况
- [预言机与结算](docs/oracle.md) — Pyth 集成、Keeper 实现
- [前端设计](docs/frontend.md) — 页面布局、数据查询策略

## 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Sui Move (edition 2024) |
| 价格预言机 | Pyth Network (Sui 集成) |
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Sui dApp Kit |
| Keeper | TypeScript + @mysten/sui SDK + @pythnetwork/pyth-sui-js |

## 项目结构

```
tide/
├── move/tide/          # Sui Move 合约
├── ui/                 # React 前端
├── docs/               # 详细设计文档
│   ├── contract.md     # 合约对象模型、函数、资金流
│   ├── oracle.md       # 预言机选型与结算机制
│   └── frontend.md     # 前端页面与数据查询策略
└── README.md
```

## 开发规划

### Phase 1 - MVP

**合约：**
- Registry / Market / Round / Ticket / UserStats 核心对象
- place_bet / settle_and_advance / redeem 核心流程
- AdminCap 权限体系
- 开放结算（permissionless settle）+ settler 激励
- 市场级暂停
- 单一时间段（5min）

**Keeper：**
- 定时结算脚本
- Pyth 价格拉取与提交

**前端：**
- 主面板（投注 + 历史 + 倒计时）
- 钱包连接
- 基本投注和领奖流程

**部署：**
- Sui Testnet
- 单市场 SUI/USD

### Phase 2 - 功能完善

- 多市场（BTC/USD, ETH/USD 等）
- 排行榜（链下索引器）
- 前端完善（排行榜页、历史记录页）
- UI 美化

### Phase 3 - 扩展

- 多时间段支持（1min / 15min / 1h）
- 更多币种市场
- 治理机制
- 社交功能（分享、跟单等）
- 移动端适配

## 安全考虑

### 合约安全

- **重入防护**：Sui Move 的所有权模型天然防重入
- **溢出保护**：Move 整数运算默认检查溢出
- **价格操控**：依赖 Pyth 预言机的多数据源聚合，单一源无法操控
- **时间操控**：使用 Sui 系统 Clock 对象，不可被用户操控
- **权限隔离**：AdminCap 管理权独立，结算为 permissionless 设计

### 经济安全

- **最低投注额**：防止 dust attack
- **手续费统一收取**：有赢家时按比例扣费（含单边全员猜对）；无赢家时（平局/全员猜错）整个池子归协议；仅取消轮次全额退款
- **市场暂停**：异常时可冻结单个市场操作

### 预言机风险

- **价格时效性校验**：单向约束 `[round_end_time, round_end_time + tolerance]`，防止选择性提交
- **Feed ID 校验**：合约内硬校验，防止传入错误价格源
- **异常处理**：价格获取失败时交易自动 revert，管理员可手动取消轮次

## 参考资料

- [Pyth Network Sui 集成文档](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/sui)
- [Pyth 价格 Feed ID 列表](https://docs.pyth.network/price-feeds/price-feeds)
- [Pyth Sui 合约地址](https://docs.pyth.network/price-feeds/contract-addresses/sui)
- [Sui Move 开发文档](https://docs.sui.io/concepts/sui-move-concepts)
- [PancakeSwap Prediction 合约（参考实现）](https://github.com/pancakeswap/pancake-smart-contracts)
- [Sui dApp Kit](https://sdk.mystenlabs.com/dapp-kit)
