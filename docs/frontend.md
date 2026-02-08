# Tide - 前端设计

## 1. 核心页面

### 1.1 主面板

```
┌─────────────────────────────────────────────────────────┐
│  [SUI/USD ▼]  [BTC/USD]  [ETH/USD]     ← 市场切换 Tab  │
├───────────────────────────────┬─────────────────────────┤
│                               │                         │
│     价格图表区域               │    投注面板              │
│     (TradingView / Pyth)      │    ┌─────────────────┐  │
│                               │    │  下一轮 #128     │  │
│     ⚠ 价格仅供参考             │    │  倒计时 03:42    │  │
│     游戏采用 Pyth 预言机价格    │    │                 │  │
│                               │    │  [🔺 UP]  [🔻 DOWN]│ │
│                               │    │  投注金额: ___   │  │
│                               │    │  [下注]          │  │
│                               │    │                 │  │
│                               │    │  UP池: 234 SUI  │  │
│                               │    │  DOWN池: 189 SUI│  │
│                               │    └─────────────────┘  │
├───────────────────────────────┴─────────────────────────┤
│  历史轮次                                                │
│  #127 ✅UP  开:3.45 收:3.52  池:420SUI  +12.5 SUI      │
│  #126 ❌DN  开:3.50 收:3.45  池:380SUI  -5 SUI         │
│  #125 ➖平  开:3.48 收:3.48  池:200SUI  退款            │
│  ...                                                    │
├─────────────────────────────────────────────────────────┤
│  即将开始                                                │
│  #129  开始于 07:32  │  #130  开始于 07:37  │ ...       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 我的记录页

Ticket 为用户持有的 owned object，已 redeem 的 Ticket 会被销毁。前端查询用户拥有的所有 Ticket，结合对应 Round 的状态分类展示：

```
┌─────────────────────────────────────────────────────┐
│  待领取                          [一键领取全部]       │
│  #127 SUI/USD  UP ▲  10 SUI  胜利 🎉  +8.5 SUI     │
│  #125 SUI/USD  UP ▲  5 SUI   平局 ➖  退款           │
│  #124 BTC/USD  DN ▼  5 SUI   已取消   退款           │
├─────────────────────────────────────────────────────┤
│  已结算（未领取）                                     │
│  #126 SUI/USD  DN ▼  5 SUI   失败 ❌                 │
├─────────────────────────────────────────────────────┤
│  进行中                                              │
│  #128 SUI/USD  UP ▲  10 SUI  LIVE 追踪中...         │
│  #129 SUI/USD  DN ▼  5 SUI   等待开盘...             │
├─────────────────────────────────────────────────────┤
│  历史记录（已 redeem，来自事件查询）                    │
│  #123 SUI/USD  UP ▲  10 SUI  胜利  +8.2 SUI         │
│  #120 SUI/USD  DN ▼  5 SUI   失败  -5 SUI           │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

**[一键领取全部] 按钮逻辑：**

使用 Sui PTB（Programmable Transaction Block）在单笔交易中批量调用 `redeem`：
- 胜利 Ticket → 领取奖金 + 销毁
- 平局/取消 Ticket → 退款 + 销毁
- 失败 Ticket → 静默销毁（清理钱包，不需要用户单独操作）

用户感知为"领取奖金"，失败 Ticket 的清理是搭便车行为，一次 gas 完成。

### 1.3 排行榜页

- 按市场筛选
- 排序维度切换（胜率、净盈亏、参与场次）
- 个人排名卡片

---

## 2. 价格图表

- 集成 TradingView 轻量图表或 Pyth 提供的价格数据
- 在图表区域显著位置标注："价格仅供参考，游戏结算使用 Pyth 预言机价格"
- 可选标注每轮的开盘/收盘价格点

---

## 3. 数据查询策略

### 3.1 主面板数据

```
1. getObject(market_id)
   → current_round_id, upcoming_round_id

2. multiGetObjects([current_round_id, upcoming_round_id])
   → 当前轮 + 下一轮详情

3. GraphQL events 倒序查询 RoundSettled (last: N)
   → 最近 N 轮历史结果
```

### 3.2 个人历史记录（倒序显示）

```
1. 查询用户持有的 Ticket 对象 (owned objects, type filter)
   → 未 redeem 的 Ticket（进行中 / 待领奖 / 待退款 / 失败未清理）
   → 结合对应 Round 状态判断每张 Ticket 的分类

2. 倒序查询用户相关事件:
   - BetPlaced (sender = user)  → 所有下注记录
   - Redeemed (sender = user)   → 已兑现记录（含 outcome 和 payout）
   → 交叉匹配得出每笔投注的完整生命周期和盈亏

3. 用户聚合数据直接读链上 UserStats:
   getDynamicFieldObject(market_id, { type: "address", value: "0xUSER" })
   → 一次查询获取 wins/draws/total_bet/total_won
```

所有查询均通过 Sui 节点 gRPC / GraphQL 完成，MVP 阶段无需额外后端服务。

---

## 4. 排行榜数据

采用**链上 UserStats + 链下索引**方案：

- 合约在 `place_bet` / `redeem` 时自动维护 `UserStats`（存于 Market 的 `Table<address, UserStats>`）
- 个人聚合数据可直接链上查询（一次 `getDynamicFieldObject(market_id, user_address)`）
- 排行榜 Top N 排序由链下索引器聚合（链上无法做排序查询）
- 索引器通过 `getDynamicFields(market_id)` 遍历所有 UserStats，定期刷新快照

---

## 5. 技术实现

- 已有基础：React 19 + Sui dApp Kit + Tailwind CSS 4
- 需增加：钱包连接、交易构建与签名、Pyth 价格订阅、实时倒计时
