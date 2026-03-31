2. 使用 valtio 进行状态管理，渲染相关代码必须用 useSnapshot 来获取状态
3. 不允许 mock 偷懒实现，所有代码都是生产级别标准
4. 实现的视觉效果优雅美观，和整体一致，当前主题颜色参考 index.css
6. 使用中文进行总结回答
7. 开发阶段不要有任何旧数据兼容逻辑
9. 没有特别要求，不要 npm run build
10. 所有配置都要通过 localApi 持久化，数据持久化基于本地文件，不要用 localstorage
11. 前端接口统一定义在 service.ts 中，尽量复用
12. 文件读写操作，都要通过 fileLock 文件的方法来进行，避免并发读写导致数据损坏

- react 状态管理优先使用 valtio，事件中用 state，渲染用 snapshot
- react 不要用 useCallback，函数直接定义。如果作为 props 函数包裹 useMemoizedFn
- valtio 中，对于数组 attr，不要像 state.items = newArray 直接整个替换，而应该用 push，splice，mutable 修改