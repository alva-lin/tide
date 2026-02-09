# Tide - 合约设计

## 1. 对象模型

```
Registry (shared, singleton)
├── admin: ID (AdminCap holder)
├── config
│   ├── fee_bps: u64                        ← 手续费率 (200 = 2%)
│   ├── settler_reward_bps: u64             ← 结算激励占手续费比例 (200 = 2%，从 fee 中划取)
│   ├── min_bet: u64                        ← 最低投注额
│   └── price_tolerance_ms: u64             ← 价格时间戳容差 (10_000ms = 10秒)
├── treasury: Balance<SUI>                  ← 手续费收入
└── market_ids: vector<ID>                  ← 市场 object ID 列表（个位数）
```

每个 Market 是**独立的 shared object**，避免跨市场交易争用：

```
Market (shared, 每个市场独立)
├── id: UID
├── pyth_feed_id: vector<u8>
├── interval_ms: u64 (300_000 = 5min)
├── status: ACTIVE | PAUSED                  ← 市场开关
├── round_count: u64
├── current_round_id: Option<ID>             ← LIVE 轮的 object ID
├── upcoming_round_id: Option<ID>            ← UPCOMING 轮的 object ID
├── rounds: ObjectTable<u64, Round>          ← key=轮次序号, Round 为独立对象
└── user_stats: Table<address, UserStats>    ← key=用户地址, 普通 struct, 合约自动创建/更新
```

**存储选型说明：**

- **Market**：`vector<ID>` + 独立 shared object。市场数量为个位数，vector 足够。独立 shared object 确保不同市场的交易互不争用。
- **Round**：`ObjectTable<u64, Round>`。O(1) 按轮次序号访问，Round 有独立 object ID 可直接查询，10 万+历史轮次不影响性能。
- **UserStats**：`Table<address, UserStats>`。普通 struct（只需 `store`），无 UID 开销。合约内部自动创建/更新，用户无感。`losses` 和 `net_profit` 为派生值，不存储，减少链上写入。
- **Treasury**：由 Registry 统一持有。`settle_and_advance` 时从 Round pool 扣除手续费转入 Registry.treasury。
- Market 内存 `current_round_id` 和 `upcoming_round_id`，前端一次读 Market 即可获取关键 Round 的 object ID。

**用户持有的对象：**

```
AdminCap (owned)         ← 管理员权限

Ticket (owned)           ← 投注凭证
├── market_id: ID
├── round_id: ID         ← Round 对象 ID，用于链下直接查询
├── round_number: u64    ← 轮次序号，用于业务逻辑 + ObjectTable key
├── direction: u8 (UP=0, DOWN=1)
└── amount: u64          ← 投注金额（任意金额）
```

**链上自动管理的数据（用户无需传入）：**

```
UserStats (struct, 存于 Market 的 Table 内, key=用户地址)
├── total_rounds: u64       ← 参与总场次
├── wins: u64               ← 胜场
├── cancels: u64            ← 取消退款场次
├── total_bet: u64          ← 总投注金额
└── total_won: u64          ← 总赢取金额（含取消退款）
    // losses = total_rounds - wins - cancels（派生，不存储）
    // net_profit = total_won - total_bet（派生，不存储）
```

UserStats 在 `place_bet` / `redeem` 中由合约自动创建和更新，用户不需要管理此数据。
同一用户可在同一轮次重复下注（含同方向），每次生成独立 Ticket。

---

## 2. Round 结构

```
Round (object, 存于 Market 的 ObjectTable 内)
├── id: UID
├── round_number: u64
├── status: UPCOMING | LIVE | SETTLED | CANCELLED
├── start_time_ms: u64               ← 创建时确定（上一轮 start_time + interval）
├── open_price: Option<u64>       ← LIVE 时记录
├── open_price_expo: Option<i64>  ← 价格精度指数
├── close_price: Option<u64>      ← 结算时记录
├── close_price_expo: Option<i64>
├── open_timestamp_ms: Option<u64>
├── close_timestamp_ms: Option<u64>
├── up_amount: u64                ← UP 方总投注
├── down_amount: u64              ← DOWN 方总投注
├── up_count: u64                 ← UP 方投注人次
├── down_count: u64               ← DOWN 方投注人次
├── pool: Balance<SUI>            ← 本轮资金池（实际余额，redeem 时减少）
├── prize_pool: u64               ← settle 时计算的固定值，用于 redeem 奖金计算
└── result: Option<u8>            ← UP=0, DOWN=1, DRAW=2
```

---

## 3. Round 生命周期

**单个 Round 状态流转：**

```
UPCOMING ─────▶ LIVE ─────▶ SETTLED
               (settle_and_advance    (下一次 settle_and_advance
                转入，记录开盘价)        结算，记录收盘价)

UPCOMING ─┬──▶ CANCELLED (cancel_round / resume_market 自动取消)
LIVE ─────┘
```

**`settle_and_advance` 原子操作（一次调用完成三步）：**

```
settle_and_advance(registry, market, clock, pyth_price, ctx):
  1. 校验 price_timestamp ∈ [upcoming.start_time, upcoming.start_time + tolerance]
  2. 如果有 LIVE round → 结算（price 作为 close_price，判定结果，处理手续费）
  3. UPCOMING → LIVE（price 作为 open_price）
  4. 创建新 UPCOMING round（start_time = 上一个 start_time + interval_ms）
```

首轮调用时步骤 2 跳过（无 LIVE round），后续轮次完整执行。一套逻辑覆盖所有场景。

**市场创建：** `create_market(start_time)` 创建市场 + 首个 UPCOMING Round（`start_time` 由管理员指定，通常对齐到整点）。市场创建后用户即可对首轮投注，首轮投注窗口不受 `interval_ms` 限制（可用于预热期积累流量）。

**时间线示意：**

```
create_market                首次 settle
(start_time=5:00)            +advance
     │                          │
     │◄──── 预热期：R1 投注 ─────►│
     │                          │
    xx:00                    00:00        05:00       10:00       15:00
                                │           │           │           │
                                ├─ R1 LIVE ─┤─ R2 LIVE ─┤─ R3 LIVE ─┤
                                ├─ R2 投注 ─┤─ R3 投注 ─┤─ R4 投注 ─┤
                                │           │           │           │
                                ▲           ▲           ▲           ▲
                                settle      settle      settle      settle
                                +advance    +advance    +advance    +advance
```

"投注下一轮"模式的核心优势：用户下注时，目标轮次的价格追踪尚未开始，完全不存在信息优势问题，无需设计锁定期。

---

## 4. 合约函数

### 生命周期管理

| 函数 | 权限 | 说明 |
|------|------|------|
| `create_registry(ctx)` | 一次性 | 创建 Registry + AdminCap |
| `create_market(admin, registry, feed_id, interval_ms, min_bet, start_time)` | AdminCap | 新建市场 + 首个 UPCOMING Round（`start_time` 由管理员指定）。创建后用户即可对首轮投注 |
| `settle_and_advance(registry, market, clock, pyth_price, ctx)` | anyone | 核心操作：结算当前 LIVE 轮 → 下一轮变 LIVE → 创建新 UPCOMING 轮。同一个价格同时用于收盘和开盘。正常胜负时从 pool 扣除手续费（settler reward 转给调用者，余额转入 Registry.treasury） |

### 用户操作

| 函数 | 权限 | 说明 |
|------|------|------|
| `place_bet(market, direction, payment: Coin<SUI>, clock, ctx)` | anyone | 对 UPCOMING 轮下注，返回 Ticket，自动创建/更新 UserStats |
| `redeem(market, ticket)` | ticket holder | 统一处理所有已结算/取消的 Ticket：胜→领奖，负→销毁，平/取消→退款。更新 UserStats |

### 管理操作

| 函数 | 权限 | 说明 |
|------|------|------|
| `cancel_round(admin, market, round_number)` | AdminCap | 取消某轮（预言机异常等） |
| `pause_market(admin, market)` | AdminCap | 暂停市场 |
| `resume_market(admin, market, new_start_time)` | AdminCap | 恢复市场：自动取消过期的 LIVE/UPCOMING 轮次，创建新 UPCOMING Round |
| `update_config(admin, registry, ...)` | AdminCap | 修改全局参数 |
| `withdraw_treasury(admin, registry, amount)` | AdminCap | 从 Registry.treasury 提取资金 |

---

## 5. 资金流

```
用户下注 (place_bet)
  └─▶ SUI 进入 Round.pool，累加到 up_amount 或 down_amount
      同一用户可重复下注，每次生成独立 Ticket

结算 (settle_and_advance)
  ├─▶ 判定结果 (UP / DOWN / DRAW)
  ├─▶ 计算 fee, reward 和 prize_pool:
  │     total = up_amount + down_amount
  │     fee = winning_total == 0 ? total : total × fee_bps / 10000
  │     settler_reward = fee × settler_reward_bps / 10000
  │     treasury_fee = fee - settler_reward
  │     从 Round.pool 取出 fee:
  │       settler_reward → 调用者 (ctx.sender)
  │       treasury_fee → Registry.treasury
  │     round.prize_pool = total - fee   ← 存储固定值
  ├─▶ 价格时间戳校验（单向，锚定 upcoming.start_time）:
  │     price_timestamp >= upcoming.start_time
  │     price_timestamp <= upcoming.start_time + price_tolerance_ms
  │     （有 LIVE 轮时 upcoming.start_time == LIVE.end_time，等价于之前的 round_end_time 校验）
  ├─▶ 同一价格同时作为本轮收盘价和下一轮开盘价
  └─▶ pool 剩余资金等待 redeem

取消 (cancel_round)
  └─▶ fee = 0, prize_pool = total，所有投注者可 redeem 退款

兑现 (redeem)
  ├─ 胜利（round.status == SETTLED && ticket.direction == round.result）:
  │   ├─▶ payout = prize_pool × ticket.amount / winning_total  ← 整数除法向下取整
  │   ├─▶ 从 Round.pool 取出 payout → 用户
  │   ├─▶ 销毁 Ticket
  │   └─▶ UserStats: wins++, total_won += payout
  ├─ 失败（round.status == SETTLED && ticket.direction != round.result，含平局）:
  │   ├─▶ 销毁 Ticket（不支付）
  │   └─▶ UserStats: （无额外更新，total_rounds 已在 place_bet 时计入）
  └─ 取消（round.status == CANCELLED）:
      ├─▶ payout = ticket.amount（原额退款）
      ├─▶ 从 Round.pool 取出 payout → 用户
      ├─▶ 销毁 Ticket
      └─▶ UserStats: cancels++, total_won += payout
```

**精度说明：** Move 整数除法向下取整，每次 redeem 的 reward 为 floor 值。n 个赢家累计最多 n-1 MIST（10^-9 SUI）的 dust 留在 pool。最后一个用户正常提现不受影响，dust 可忽略不计。

奖金永久保留在 Round pool 中，不设过期时间。用户可随时 redeem。

---

## 6. 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 收盘价 == 开盘价（平局） | result = DRAW，winning_total = 0，fee = total，资金归 treasury，所有 Ticket 按失败处理 |
| 单边投注 | 正常判定胜负、正常扣费。全员猜对时每人拿回 `my_bet × (1 - fee_rate)`；全员猜错时 fee = total 归 treasury |
| 无人投注 | 正常结算，pool 为空，无需处理 |
| 预言机价格不在窗口内 | settle_and_advance 中校验 price_timestamp ∈ [upcoming.start_time, upcoming.start_time + tolerance]，不满足则 revert |
| 预言机异常 | 管理员调用 cancel_round，所有投注者可 redeem 退款 |
| 市场暂停 | 该市场的写操作（下注、结算等）被拒绝 |
| 市场恢复 | `resume_market(new_start_time)` 自动取消过期的 LIVE/UPCOMING 轮次（用户可退款），创建新 UPCOMING Round |
| 失败 Ticket | redeem 时直接销毁，不支付 |
| 未 redeem 的胜利 Ticket | 奖金永久保留在 Round pool 中，不设过期 |

---

## 7. 暂停机制

市场级暂停：

```
写操作可执行条件 = market.status == ACTIVE
```

- `pause_market`：暂停该市场的所有写操作（下注、结算），用于币种异常或预言机故障。轮次冻结在当前状态。
- `resume_market(new_start_time)`：恢复市场。自动取消当前 LIVE round（如有）和 UPCOMING round → 用户可 redeem 退款。创建新的 UPCOMING Round（`new_start_time` 由管理员指定）。后续 `settle_and_advance` 正常接管。

---

## 8. 事件定义

合约在关键动作时发出以下事件，供链下索引和历史查询：

```
BetPlaced { market_id, round_number, player, direction, amount }
RoundSettled { market_id, round_number, result, open_price, close_price, up_amount, down_amount, settler, settler_reward }
Redeemed { market_id, round_number, player, outcome: WIN|LOSE|CANCEL, bet_amount, payout }
RoundCancelled { market_id, round_number }
```
