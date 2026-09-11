# Stage 18 Score Formula — Accepted Test Vectors

批准日期：2026-08-04
批准来源：`CURRENT_TASK_EXPLICIT_USER_APPROVAL`

## 1. 唯一 V1 公式

```text
thresholdSeconds = 72000
scoringSeconds = min(totalValidCreditedSeconds, 72000)
excessSeconds = max(totalValidCreditedSeconds - 72000, 0)
rawScore = scoringSeconds * 100 / 72000
qualificationStatus = totalValidCreditedSeconds >= 72000 ? QUALIFIED : NOT_QUALIFIED
roundedScore = HALF_UP(rawScore, 2)
finalScore = qualificationStatus == NOT_QUALIFIED && roundedScore == 100.00
  ? 99.99
  : roundedScore
```

所有运算使用 Decimal；中间值不舍入，最终仅执行一次两位小数 `HALF_UP`。V1 为 total-only；course/general 只作展示分类。

## 2. 确定性秒数向量

| totalValidCreditedSeconds | qualificationStatus | scoringSeconds | excessSeconds | rawScore | finalScore |
|---:|---|---:|---:|---:|---:|
| 0 | NOT_QUALIFIED | 0 | 0 | 0 | 0.00 |
| 1 | NOT_QUALIFIED | 1 | 0 | 0.001388... | 0.00 |
| 3599 | NOT_QUALIFIED | 3599 | 0 | 4.998611... | 5.00 |
| 3600 | NOT_QUALIFIED | 3600 | 0 | 5 | 5.00 |
| 7199 | NOT_QUALIFIED | 7199 | 0 | 9.998611... | 10.00 |
| 7200 | NOT_QUALIFIED | 7200 | 0 | 10 | 10.00 |
| 36000 | NOT_QUALIFIED | 36000 | 0 | 50 | 50.00 |
| 71999 | NOT_QUALIFIED | 71999 | 0 | 99.998611... | 99.99 |
| 72000 | QUALIFIED | 72000 | 0 | 100 | 100.00 |
| 72001 | QUALIFIED | 72000 | 1 | 100 | 100.00 |
| 90000 | QUALIFIED | 72000 | 18000 | 100 | 100.00 |
| 144000 | QUALIFIED | 72000 | 72000 | 100 | 100.00 |

- 20 条各 3600 秒 VALID Record：72000 秒，`QUALIFIED`，100.00。
- 10 条各 7200 秒 VALID Record：72000 秒，`QUALIFIED`，100.00。

## 3. 舍入边界

| raw Decimal | HALF_UP 2dp |
|---:|---:|
| 73.124 | 73.12 |
| 73.125 | 73.13 |
| 73.126 | 73.13 |
| 73.135 | 73.14 |

未达标结果若舍入为 100.00，必须改为 99.99；不得通过先舍入秒数、二进制 float 或中间舍入改变结果。

## 4. Review 与幂等向量

- VALID → INVALID：新 working revision 不再包含该 Record contribution；旧 revision 保留。
- INVALID → VALID：新 working revision 恢复该 Record contribution。
- VALID → PENDING（reopen）：新 working revision 不包含该 contribution。
- 重复 Review Outbox、同 Record 重复输入或 worker 重试：相同 Rule version + sourceFingerprint 复用同一 revision。
- 不同 Rule version：必须产生新 revision，即使有效秒数相同。

## 5. Adjustment 与发布向量

- `FINAL_SCORE_DELTA`：按批准顺序在当前分数上加 delta。
- `FINAL_SCORE_REPLACEMENT`：用批准值替换当前分数。
- `CALCULATION_CORRECTION`：用批准的纠正值替换当前分数并保留原因/证据历史。
- 计算结果小于 0.00 或大于 100.00：批准失败，不 clamp，不创建 revision。
- PUBLISHED 后输入变化：published revision 不变；新 working revision 标记待重新发布。
- Teacher 再次 publish：原子切换 published pointer 并追加 publication event。
