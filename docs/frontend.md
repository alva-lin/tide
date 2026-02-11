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

### 1.3 排行榜页（未实现）

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
   → market 完整数据，包含 current_round / upcoming_round 序号
   → rounds Table 中的 Round 数据可通过 getDynamicFieldObject 访问

2. getDynamicFieldObject(market_id, current_round)
   getDynamicFieldObject(market_id, upcoming_round)
   → 当前 LIVE 轮 + 下一轮详情

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

3. 用户聚合统计（胜场、总投注、总赢取等）由 Keeper 链下索引提供:
   - Keeper 索引 BetPlaced / Redeemed 事件，聚合用户数据
   - 前端通过 Keeper API 查询（Phase 2）
   - MVP 阶段可前端本地查询事件聚合
```

所有查询均通过 Sui 节点 gRPC / GraphQL 完成，MVP 阶段无需额外后端服务。

---

## 4. 排行榜数据（未实现）

规划采用 **Keeper 链下索引**方案：

- Keeper 在结算之余监听 `BetPlaced` 和 `Redeemed` 事件，聚合每个用户的统计数据（胜场、总投注、总赢取等）
- 排行榜 Top N 排序由 Keeper 索引服务计算并提供 API

---

## 5. 技术实现

- React 19 + TypeScript + Tailwind CSS 4 + Sui dApp Kit（钱包连接）
- TanStack React Query（RPC 数据缓存）
- Lightweight Charts（TradingView K线图）
- Nanostores（轻量状态管理）
- Pyth 实时价格订阅 + 倒计时 hooks
