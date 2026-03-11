# Vue SVG Refactor MCP Server

智慧型 SVG 重構工具，專為 Vue 3 + Tailwind CSS 專案設計的 MCP Server。

## 功能特色

- **智慧分析** - 自動分析專案中所有 SVG 的使用方式
- **找出重複** - 偵測重複使用的 SVG 並建議抽成組件
- **自動生成** - 一鍵生成符合規範的 Vue Icon 組件
- **顏色檢查** - 確保 SVG 使用 `currentColor` 以便 CSS 控制
- **自動轉換** - 將 `<img>` 標籤轉換為 `<InlineSVG>`
- **無縫整合** - 與 Claude Code 完美整合，自然語言操作

## command overview
  1. analyze_svg_usage - 分析 SVG 使用方式
  2. find_duplicate_svgs - 找出重複的 SVG
  3. suggest_svg_components - 建議應抽成組件的 SVG
  4. generate_svg_component - 自動生成組件
  5. ensure_current_color - 檢查/修正 currentColor
  6. convert_img_to_inline - 轉換 img 為 InlineSVG

## 快速開始

### 安裝

```bash
# 全域安裝
npm install -g mcp-vue-svg-refactor

# 或從源碼安裝
git clone <repository-url>
cd mcp-vue-svg-refactor
npm install
npm run build
npm link
```

### 設定 Claude Code

在 `~/.claude/mcp_settings.json` 中加入：

```json
{
  "mcpServers": {
    "vue-svg-refactor": {
      "command": "mcp-vue-svg-refactor"
    }
  }
}
```

重啟 Claude Code 即可使用。

## 可用工具

### 1. `analyze_svg_usage`

分析專案中所有 SVG 的使用方式。

**參數：**
- `projectPath` (string, 必填) - 專案根目錄路徑

**使用範例：**
```
請幫我分析 /Users/ou/projects/my-vue-app 專案中的 SVG 使用情況
```

**回傳資料：**
```json
{
  "totalSvgFiles": 15,
  "totalUsages": 42,
  "usagesByType": {
    "img": 8,
    "inline-svg-component": 12,
    "inline-code": 18,
    "vue-component": 4
  },
  "svgFiles": ["..."],
  "usages": [...]
}
```

---

### 2. `find_duplicate_svgs`

找出在多個地方重複使用的 SVG 圖示。

**參數：**
- `projectPath` (string, 必填) - 專案根目錄路徑
- `minUsageCount` (number, 選填) - 最少重複次數，預設 2

**使用範例：**
```
請找出專案中重複使用超過 3 次的 SVG
```

**回傳資料：**
```json
[
  {
    "svgPath": "@/assets/icons/search.svg",
    "usageCount": 5,
    "locations": [
      { "file": "src/Header.vue", "line": 42 },
      { "file": "src/Sidebar.vue", "line": 18 }
    ],
    "suggestion": "建議建立 SearchIcon 組件，取代 5 處重複使用"
  }
]
```

---

### 3. `suggest_svg_components`

建議哪些 SVG 應該抽成可重用的 Vue 組件。

**參數：**
- `projectPath` (string, 必填) - 專案根目錄路徑

**使用範例：**
```
請建議哪些 SVG 應該抽成組件
```

**回傳資料：**
```json
[
  {
    "componentName": "SearchIcon",
    "svgPath": "@/assets/icons/search.svg",
    "usageCount": 5,
    "priority": "high"
  }
]
```

**優先級：**
- `high` - 使用次數 ≥ 5
- `medium` - 使用次數 3-4
- `low` - 使用次數 2

---

### 4. `generate_svg_component`

自動生成 SVG Vue 組件。

**參數：**
- `svgPath` (string, 必填) - SVG 檔案路徑
- `componentName` (string, 必填) - 組件名稱（例如：ChevronDownIcon）
- `outputPath` (string, 必填) - 輸出路徑（例如：src/components/icons/）

**使用範例：**
```
請幫我把 assets/icons/search.svg 轉成 SearchIcon 組件，
輸出到 src/components/icons/
```

**生成的組件範例：**
```vue
<script setup lang="ts">
/**
 * SearchIcon - 自動生成的 SVG 圖示組件
 * 來源：assets/icons/search.svg
 * 可透過 class prop 控制大小和顏色
 */
defineProps<{
  class?: string
}>()
</script>

<template>
  <svg :class="$props.class" viewBox="0 0 24 24" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" />
    <path d="M15 15L21 20" stroke="currentColor" />
  </svg>
</template>
```

---

### 5. `ensure_current_color`

檢查 SVG 是否使用 `currentColor`，若否則自動修正。

**參數：**
- `svgPath` (string, 必填) - SVG 檔案路徑
- `autoFix` (boolean, 選填) - 是否自動修正，預設 false

**使用範例：**
```
請檢查 assets/icons/logo.svg 是否使用 currentColor
```

```
請自動修正 assets/icons/logo.svg 為使用 currentColor
```

**回傳資料：**
```json
{
  "needsFix": true,
  "fixed": true,
  "message": "✅ 已自動修正為 currentColor"
}
```

---

### 6. `convert_img_to_inline`

將 Vue 檔案中的 `<img src="...svg">` 轉換為 `<InlineSVG>`。

**參數：**
- `vueFilePath` (string, 必填) - Vue 檔案路徑
- `dryRun` (boolean, 選填) - 是否只預覽不實際修改，預設 true

**使用範例：**
```
請預覽將 HeaderPartial.vue 中的 img 轉換為 InlineSVG 的結果
```

```
請將 HeaderPartial.vue 中的 img 轉換為 InlineSVG（實際修改）
```

**功能：**
- 自動替換 `<img :src="SvgIcon">` 為 `<InlineSVG :src="SvgIcon">`
- 自動加入 `import InlineSVG from 'vue-inline-svg'`
- 保留所有其他屬性（class、alt 等）

---

## 使用場景

### 場景 1：新專案重構

```
請幫我分析專案中的 SVG 使用情況，然後建議哪些應該抽成組件
```

Claude 會：
1. 調用 `analyze_svg_usage` 分析整體狀況
2. 調用 `suggest_svg_components` 提供建議
3. 根據優先級給出重構計劃

### 場景 2：建立 Icon 組件

```
請把 assets/icons/search.svg 轉成 SearchIcon 組件
```

Claude 會：
1. 調用 `generate_svg_component` 生成組件
2. 確保 SVG 使用 `currentColor`
3. 回報生成的檔案位置

### 場景 3：修正顏色問題

```
我的搜尋圖示顯示為黑色，但我設定了 text-esun-brand-800
```

Claude 會：
1. 理解問題（`<img>` 無法用 CSS 控制顏色）
2. 建議使用 `<InlineSVG>` 或抽成組件
3. 調用 `convert_img_to_inline` 自動轉換

### 場景 4：批次處理

```
請幫我將專案中所有使用超過 2 次的 SVG 都轉成組件
```

Claude 會：
1. 調用 `find_duplicate_svgs`
2. 逐一調用 `generate_svg_component`
3. 提供完整的修改清單

---

## 開發指南

### 專案結構

```
mcp-vue-svg-refactor/
├── src/
│   └── index.ts       # 主程式
├── dist/              # 編譯輸出
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

### 本地開發

```bash
# 安裝依賴
npm install

# 開發模式（監聽檔案變更）
npm run dev

# 編譯
npm run build

# 測試（建立全域連結）
npm link
```

### 修改工具定義

編輯 `src/index.ts` 中的 `tools` 陣列：

```typescript
const tools: Tool[] = [
  {
    name: 'my_new_tool',
    description: '新工具的描述',
    inputSchema: {
      type: 'object',
      properties: {
        param1: { type: 'string' }
      },
      required: ['param1']
    }
  }
]
```

### 實作新工具

在 `CallToolRequestSchema` handler 中加入新的 case：

```typescript
case 'my_new_tool': {
  const result = myNewFunction(args.param1 as string)
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
  }
}
```

---

## 技術架構

### 核心依賴

- **@modelcontextprotocol/sdk** - MCP Server SDK
- **fast-xml-parser** - SVG 解析
- **glob** - 檔案搜尋
- **TypeScript** - 型別安全

### 工作原理

```
Claude Code
    ↓ (自然語言)
MCP Server (本地 Node.js 程序)
    ↓ (讀取檔案)
你的 Vue 專案
    ↓ (分析、生成)
自動重構結果
```

### 為什麼選擇 MCP？

- **整合 Claude** - 自然語言操作，無需記指令
- **智慧分析** - AI 理解上下文，提供更好建議
- **本地執行** - 無需上傳程式碼，保護隱私
- **可擴展** - 輕鬆加入新工具

---

## 常見問題

### Q: 使用這個工具會消耗額外的 Claude token 嗎？

A: 會有少量開銷（每次對話約 500 tokens 的工具定義），但通常反而能**節省 token**，因為不需要複製貼上大量程式碼給 Claude 分析。

### Q: 團隊成員如何使用？

A: 有三種方式：
1. **全域安裝**（推薦）- 每個人執行 `npm install -g mcp-vue-svg-refactor`
2. **從源碼安裝** - Clone repo 後執行 `npm link`
3. **發布到 npm** - 發布到公司內部或公開 npm registry

### Q: 可以在 CI/CD 中使用嗎？

A: 目前主要設計為本地開發工具，但可以透過 Node.js 直接調用函數來整合到 CI/CD。

### Q: 支援哪些 SVG 格式？

A: 支援所有標準 SVG 格式。建議 SVG 內部使用 `stroke="currentColor"` 和 `fill="currentColor"` 以便 CSS 控制顏色。

### Q: 會修改我的原始檔案嗎？

A: 除非明確指定（例如 `autoFix: true` 或 `dryRun: false`），否則只會分析和預覽，不會實際修改檔案。

---

## 更新日誌

### v1.0.0 (2026-03-11)

- 初始版本
- 支援 6 種 SVG 分析和重構工具
- 完整的 TypeScript 型別支援
- 與 Claude Code 整合

---

## 授權

MIT License

---

## 貢獻

歡迎提交 Issue 和 Pull Request！

### 開發步驟

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

---

## 聯絡

如有問題或建議，請開啟 Issue。

---

Built for Vue 3 + Tailwind CSS developers
