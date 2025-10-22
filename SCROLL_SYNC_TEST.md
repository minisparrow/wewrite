# 滚动同步测试文档

## 测试步骤

### 1. 重新加载插件
- 按 `Cmd/Ctrl + P` 打开命令面板
- 输入 "Reload app without saving" 并回车
- 或者完全关闭并重新打开 Obsidian

### 2. 打开预览面板
- 打开任意一个较长的 Markdown 文件
- 点击右侧边栏的 WeWrite 预览面板

### 3. 查看控制台日志
- 按 `Cmd/Ctrl + Shift + I` 打开开发者工具
- 切换到 Console 标签
- 应该能看到类似这样的日志：
  ```
  [WeWrite ScrollSync] Initial sync setup
  [WeWrite ScrollSync] Found .cm-scroller
  [WeWrite ScrollSync] Starting scroll sync
  [WeWrite ScrollSync] Scroll sync started successfully
  ```

### 4. 测试滚动
- 在编辑器中滚动 → 预览应该跟随
- 在预览面板中滚动 → 编辑器应该跟随

### 5. 测试开关按钮
- 点击预览面板标题栏的 🔗 图标
- 再次滚动，应该不再同步
- 再次点击图标，滚动同步恢复

## 如果不工作

### 检查点 1：查看控制台
看看是否有错误或者找不到滚动容器的消息：
- `[WeWrite ScrollSync] No active markdown view` - 没有找到编辑器
- `[WeWrite ScrollSync] No scroll container found` - 找不到滚动容器

### 检查点 2：手动触发
在控制台执行：
```javascript
// 获取预览面板实例
const previewLeaf = app.workspace.getLeavesOfType('wewrite-article-preview')[0];
const preview = previewLeaf?.view;

// 手动启动同步
preview?.startScrollSync();
```

### 检查点 3：检查元素
在开发者工具的 Elements 标签中：
1. 找到编辑器的 `.cm-scroller` 元素
2. 找到预览的 `.wewrite-article` 元素
3. 确认它们都有 `overflow-y: auto` 或 `overflow: auto` 样式

## 生成测试内容

下面是一些内容用于测试滚动：

---

## 第一部分

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## 第二部分

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## 第三部分

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## 第四部分

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## 第五部分

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.

## 第六部分

Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

## 第七部分

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.

## 第八部分

Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.

## 第九部分

Sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

## 第十部分

Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.

## 第十一部分

Nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate.

## 第十二部分

Velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.

## 第十三部分

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque.

## 第十四部分

Corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.

## 第十五部分

Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.

## 第十六部分

Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio.

## 第十七部分

Cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est.

## 第十八部分

Omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet.

## 第十九部分

Ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum rerum hic tenetur a sapiente delectus.

## 第二十部分

Ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat.
