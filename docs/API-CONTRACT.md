# 4.2.1 接口与数据契约

本文件描述当前本地源码，不代表云端已更新。

## 分层与调用

`miniprogram/pages` 负责交互，`lib/family.js` 负责云请求、防重、成员失效，`lib/api.js` 兼容旧 notebook 操作。`core/personal.js` 是纯数据规则；`core/record-draft.js` 是本机关键词整理器。`cloudfunctions/warmcare/lib/family.js` 集中实施家庭权限和业务状态；`lib/entry.js` 适配数据库事务、云存储、微信通知。`index.js` 为生成文件，禁止手工修改。

请求：`{ operation, payload, requestId }`。读操作可省略 requestId；写操作必须使用 16—100 位字母、数字、下划线或连字符 ID。同一身份、同一 ID、同一输入重试返回原结果；同 ID 不同输入被拒。身份取自云函数上下文，不接受客户端传入身份替代。

返回：成功 `{ok:true,data:...}`；失败 `{ok:false,error:{code,message}}`。前端显示 message，以 code 决定恢复动作。

## 操作与权限

| 操作 | 输入摘要 | 权限及结果 |
|---|---|---|
| identity / session | 无 | identity 仅本人标识；session 仅当前成员可见投影，未加入返回 me:null |
| family.create | role、name、可选 phone/familyName | 仅配置创建人、家庭为空；返回 memberId |
| family.invite / join | role、可选 elderId / token、name、phone | 成员可邀请家人；另一长辈由创建人邀请；24 小时一次性令牌，最多 10 份待用邀请、20 成员 |
| family.revokeInvite / revokeInvites | id / 无 | 单份由邀请人或创建人撤销；全部仅创建人 |
| profile.update / family.follow | name、phone / elderIds | 修改本人资料；仅家人端设置关注 |
| family.remove | id | 创建人移除他人，或成员退出本人；创建人不可移除；不立即删除历史内容 |
| family.cleanupDeparted | confirm=DELETE_DEPARTED_CONTENT | 仅创建人二次确认；删除离开作者的留言及关联录音、共享记录；返回删除数量，不返回私信内容 |
| message.send | text、mediaId、important、audience、recipientIds | family=全家、members=指定现有成员；不得只选自己；返回 id |
| message.read / ack | id | 仅可见留言；ack 同时记录 seenAt/confirmedAt，不能代表他人确认 |
| message.remove | id | 仅发送者；标记录音待清理，清理失败可重试 |
| media.upload / get / clean | base64、duration / id / 无 | 上传 MP3 1—60 秒、约 400 KB 上限；本人或留言获授权接收者可听；每人未发送录音最多 5 份 |
| record.save / delete | id?、subjectMemberId?、date、category、content / id | 新生活记录全家可见、仅作者可编辑删除；关联任意家庭成员或全家 |
| notebook.apply | action:{type,payload}、expectedRevision | 旧资料/待办/旧记录；家人端按既有权限，老人端仅本人关联内容，不可操作长辈资料；返回空对象后重新读 session |
| sos.raise / ack / close | elderId、note / id / id、cancel? | 一长辈同时一个 active，最多 20 active；家人端确认；发送者或家人端结束，发送者可取消 |

旧版 message.send 未传 audience 时按原 elderId/关注规则处理。新端始终传 audience。旧 notebook 与新版 familyRecords 并存，不擅自迁移或扩大旧记录权限。

## 数据与状态

单个 `family_private/family` 文档保存 members、invites（令牌哈希）、messages、alerts、media、familyRecords、notebook、receipts。session 不返回所有私有原始数据，使用服务端投影；创建人整理离开成员时只获计数。

留言状态：创建 → 可见接收者主动查看 → 主动确认（如需要）→ 作者删除。微信发送状态和阅读状态分别保存。语音状态：已上传未绑定 → 绑定留言；或 deleted/deleting → 清理完成。清理失败保持不可绑定，事务复核绑定状态后再删文件，不将云存储删除当作数据库事务的一部分。

SOS：active → closed / cancelled；确认只修改接收回执。历史最多保留近 30 天 80 条，空间不足时可继续裁剪已结束历史，永不以历史配额删除 active。移除成员会移除其接收条目，保留累计确认数量。

普通内容接近 850,000 个 JSON UTF-8 字节时停止新增，为 SOS 留出余量；应用总量仍限制在 1,000,000 字节以下。这是应用保护阈值，不承诺无限求助或无限容量。清理/删除仍可腾出空间；旧 notebook 另有 180,000 字符约束。记录总数最多 1000，留言 200，待办 500；字节限制可能先于条数触发。

## 并发、重试与错误

- notebook.apply 新前端附 expectedRevision；不匹配返回 REVISION_CONFLICT，须先刷新再编辑。为兼容旧端，未附版本的旧请求仍沿用原行为，不能声称所有旧客户端都具备冲突保护。全局版本粒度可能让无关资料修改也要求刷新。
- 写入成功但随后读取失败：前端标记 COMMITTED_REFRESH_FAILED，清空已保存表单、阻止再次新建，重试同意图只读。刷新成功后解锁。该标记是当前进程内恢复状态，不是持久交易队列。
- 客户端最多保留 20 个待确认意图指纹和 ID，不保存正文；服务器保留最近 120 条写回执。防重受此窗口约束，没有无限时长承诺。长时间离线后应先核对列表，不能盲目重复提交。
- MEMBERSHIP_REQUIRED：清理页面私有状态、录音/播放器，丢弃迟到响应并回身份页。离线时只能在下次成功鉴权后发现撤销，不能远程收回对方已自行导出的内容。
- VALIDATION_FAILED：按提示修正输入或权限条件；INTERNAL_ERROR：保留请求 ID 后重试。空间不足目前也是验证错误。通知失败保留留言和真实通知状态。
- 日志仅包含 source、operation、requestId、stage、code；不得写入正文、号码、OpenID、邀请码、录音、SDK 原始错误。requestId 用于关联排错，业务失败与通知失败分阶段记录。

## 性能与扩展边界

消息列表每次渲染 30 条，搜索基于全部可见消息；生活记录已有分页展示。前台仍每约 8 秒读完整 session，单文档事务仍可能争用。此次没有通过迁移多集合改变现有数据。增量拉取、服务端分页和低端设备性能基线列为后续项；实现增量版本时必须覆盖通知副作用与成员撤销，不能只比较普通写入 revision。
