1. 用于描述该文件夹下的逻辑。仅给出简述和文件索引。每次代码更新，都要更新对应目录下的 agetns.md 文件（如果有）
2. 使用 valtio 进行状态管理，渲染相关代码必须用 useSnapshot 来获取状态
3. 不允许 mock 偷懒实现，所有代码都是生产级别标准
4. 实现的视觉效果优雅美观，和整体一致，当前主题颜色参考 index.css
5. 所有应用内的语言用英文
6. 使用中文进行总结回答
7. 开发阶段不要有任何旧数据兼容逻辑
8. 复用组件，避免重复实现相同功能，可复用的组件有：
  - ConfirmModal，用于确认框
  - CanvasButton，用于画布上的按钮
  - Swatch，用于颜色选择器上的颜色块
  - ColorPicker，用于颜色选择器
9. 没有特别要求，不要 npm run build
10. 所有配置都要通过 localApi 持久化，数据持久化基于本地文件，不要用 localstorage
11. 所有文案都需要国际化，参考 app/shared/i18n/agents.md
12. 防抖、节流等工具函数用 radash
13. 能在对应 valtio store 管理的，不要用 useState
14. 文件读写操作，都要通过 fileLock 文件的方法来进行，避免并发读写导致数据损坏