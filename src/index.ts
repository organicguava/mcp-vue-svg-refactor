#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js'
import { glob } from 'glob'
import { readFileSync, writeFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import path from 'path'

// ==================== 工具定義 ====================

const tools: Tool[] = [
  {
    name: 'analyze_svg_usage',
    description: '分析專案中所有 SVG 的使用方式（<img>、<InlineSVG>、inline SVG、組件）',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: '專案根目錄路徑'
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'find_duplicate_svgs',
    description: '找出在多個地方重複使用的 SVG 圖示',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: '專案根目錄路徑'
        },
        minUsageCount: {
          type: 'number',
          description: '最少重複次數（預設 2）',
          default: 2
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'suggest_svg_components',
    description: '建議哪些 SVG 應該抽成可重用的 Vue 組件',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: '專案根目錄路徑'
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'generate_svg_component',
    description: '自動生成 SVG Vue 組件',
    inputSchema: {
      type: 'object',
      properties: {
        svgPath: {
          type: 'string',
          description: 'SVG 檔案路徑'
        },
        componentName: {
          type: 'string',
          description: '組件名稱（例如：ChevronDownIcon）'
        },
        outputPath: {
          type: 'string',
          description: '輸出路徑（例如：src/components/icons/）'
        }
      },
      required: ['svgPath', 'componentName', 'outputPath']
    }
  },
  {
    name: 'ensure_current_color',
    description: '檢查 SVG 是否使用 currentColor，若否則自動修正',
    inputSchema: {
      type: 'object',
      properties: {
        svgPath: {
          type: 'string',
          description: 'SVG 檔案路徑'
        },
        autoFix: {
          type: 'boolean',
          description: '是否自動修正（預設 false）',
          default: false
        }
      },
      required: ['svgPath']
    }
  },
  {
    name: 'convert_img_to_inline',
    description: '將 Vue 檔案中的 <img src="...svg"> 轉換為 <InlineSVG>',
    inputSchema: {
      type: 'object',
      properties: {
        vueFilePath: {
          type: 'string',
          description: 'Vue 檔案路徑'
        },
        dryRun: {
          type: 'boolean',
          description: '是否只預覽不實際修改（預設 true）',
          default: true
        }
      },
      required: ['vueFilePath']
    }
  }
]

// ==================== 分析函數 ====================

interface SvgUsage {
  type: 'img' | 'inline-svg-component' | 'inline-code' | 'vue-component'
  file: string
  line: number
  svgPath?: string
  code?: string
}

interface SvgAnalysis {
  totalSvgFiles: number
  totalUsages: number
  usagesByType: Record<string, number>
  svgFiles: string[]
  usages: SvgUsage[]
}

function analyzeSvgUsage(projectPath: string): SvgAnalysis {
  // 1. 找出所有 SVG 檔案
  const svgFiles = glob.sync(`${projectPath}/**/*.svg`, {
    ignore: ['**/node_modules/**', '**/dist/**']
  })

  // 2. 找出所有 Vue 檔案
  const vueFiles = glob.sync(`${projectPath}/**/*.vue`, {
    ignore: ['**/node_modules/**', '**/dist/**']
  })

  const usages: SvgUsage[] = []
  const usagesByType: Record<string, number> = {
    img: 0,
    'inline-svg-component': 0,
    'inline-code': 0,
    'vue-component': 0
  }

  vueFiles.forEach(file => {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      // 偵測 <img :src="...svg">
      const imgMatch = line.match(/<img[^>]*:src="([^"]*\.svg[^"]*)"/i)
      if (imgMatch) {
        usages.push({
          type: 'img',
          file,
          line: index + 1,
          svgPath: imgMatch[1]
        })
        usagesByType.img++
      }

      // 偵測 <InlineSVG :src="...">
      const inlineSvgMatch = line.match(/<InlineSVG[^>]*:src="([^"]*)"/i)
      if (inlineSvgMatch) {
        usages.push({
          type: 'inline-svg-component',
          file,
          line: index + 1,
          svgPath: inlineSvgMatch[1]
        })
        usagesByType['inline-svg-component']++
      }

      // 偵測 inline SVG code
      if (line.includes('<svg')) {
        usages.push({
          type: 'inline-code',
          file,
          line: index + 1,
          code: line.trim()
        })
        usagesByType['inline-code']++
      }

      // 偵測 Vue Icon 組件（例如 <ChevronDownIcon>）
      const iconComponentMatch = line.match(/<([A-Z]\w*Icon)[^>]*>/i)
      if (iconComponentMatch) {
        usages.push({
          type: 'vue-component',
          file,
          line: index + 1,
          code: iconComponentMatch[0]
        })
        usagesByType['vue-component']++
      }
    })
  })

  return {
    totalSvgFiles: svgFiles.length,
    totalUsages: usages.length,
    usagesByType,
    svgFiles,
    usages
  }
}

// ==================== 找出重複的 SVG ====================

interface DuplicateSvg {
  svgPath: string
  usageCount: number
  locations: Array<{ file: string; line: number }>
  suggestion: string
}

function findDuplicateSvgs(
  projectPath: string,
  minUsageCount: number = 2
): DuplicateSvg[] {
  const analysis = analyzeSvgUsage(projectPath)
  const svgUsageMap = new Map<string, Array<{ file: string; line: number }>>()

  analysis.usages.forEach(usage => {
    if (usage.svgPath) {
      const key = usage.svgPath
      if (!svgUsageMap.has(key)) {
        svgUsageMap.set(key, [])
      }
      svgUsageMap.get(key)!.push({ file: usage.file, line: usage.line })
    }
  })

  const duplicates: DuplicateSvg[] = []

  svgUsageMap.forEach((locations, svgPath) => {
    if (locations.length >= minUsageCount) {
      const componentName = path
        .basename(svgPath, '.svg')
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('') + 'Icon'

      duplicates.push({
        svgPath,
        usageCount: locations.length,
        locations,
        suggestion: `建議建立 ${componentName} 組件，取代 ${locations.length} 處重複使用`
      })
    }
  })

  return duplicates.sort((a, b) => b.usageCount - a.usageCount)
}

// ==================== 生成 SVG 組件 ====================

function generateSvgComponent(
  svgPath: string,
  componentName: string,
  outputPath: string
): { success: boolean; filePath?: string; error?: string } {
  try {
    // 讀取 SVG 內容
    const svgContent = readFileSync(svgPath, 'utf-8')

    // 移除 width/height 屬性（讓 class 控制大小）
    let cleanedSvg = svgContent
      .replace(/\s*width="[^"]*"/g, '')
      .replace(/\s*height="[^"]*"/g, '')
      .replace(/<svg/, '<svg\n    :class="$props.class"')

    // 生成 Vue 組件
    const componentCode = `<script setup lang="ts">
/**
 * ${componentName} - 自動生成的 SVG 圖示組件
 * 來源：${svgPath}
 * 可透過 class prop 控制大小和顏色
 */
defineProps<{
  class?: string
}>()
</script>

<template>
${cleanedSvg.split('\n').map(line => '  ' + line).join('\n')}
</template>
`

    // 寫入檔案
    const fullOutputPath = path.join(outputPath, `${componentName}.vue`)
    writeFileSync(fullOutputPath, componentCode, 'utf-8')

    return {
      success: true,
      filePath: fullOutputPath
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// ==================== 確保使用 currentColor ====================

function ensureCurrentColor(
  svgPath: string,
  autoFix: boolean = false
): { needsFix: boolean; fixed?: boolean; message: string } {
  const content = readFileSync(svgPath, 'utf-8')

  const hasHardcodedColor =
    content.includes('fill="#') ||
    content.includes('stroke="#') ||
    content.includes('fill="rgb') ||
    content.includes('stroke="rgb')

  const hasCurrentColor = content.includes('currentColor')

  if (!hasHardcodedColor) {
    return {
      needsFix: false,
      message: '✅ SVG 已正確使用 currentColor 或沒有顏色屬性'
    }
  }

  if (!autoFix) {
    return {
      needsFix: true,
      message: `⚠️ SVG 使用硬編碼顏色，建議改為 currentColor`
    }
  }

  // 自動修復
  let fixed = content
    .replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="currentColor"')
    .replace(/stroke="#[0-9a-fA-F]{6}"/g, 'stroke="currentColor"')
    .replace(/fill="rgb\([^)]+\)"/g, 'fill="currentColor"')
    .replace(/stroke="rgb\([^)]+\)"/g, 'stroke="currentColor"')

  writeFileSync(svgPath, fixed, 'utf-8')

  return {
    needsFix: true,
    fixed: true,
    message: '✅ 已自動修正為 currentColor'
  }
}

// ==================== 轉換 img 為 InlineSVG ====================

function convertImgToInline(
  vueFilePath: string,
  dryRun: boolean = true
): { changes: number; preview?: string; error?: string } {
  try {
    const content = readFileSync(vueFilePath, 'utf-8')
    let newContent = content
    let changes = 0

    // 找出所有 <img :src="...svg">
    const imgRegex = /<img\s+([^>]*):src="([^"]*\.svg[^"]*)"/g
    let match

    const replacements: Array<{ old: string; new: string }> = []

    while ((match = imgRegex.exec(content)) !== null) {
      const fullMatch = match[0]
      const otherAttrs = match[1]
      const svgVar = match[2]

      const newTag = `<InlineSVG ${otherAttrs}:src="${svgVar}"`
      replacements.push({ old: fullMatch, new: newTag })
      changes++
    }

    // 套用替換
    replacements.forEach(({ old, new: newTag }) => {
      newContent = newContent.replace(old, newTag)
    })

    // 確保有 import InlineSVG
    if (changes > 0 && !content.includes('import InlineSVG')) {
      const scriptMatch = content.match(/(<script setup lang="ts">)/i)
      if (scriptMatch) {
        newContent = newContent.replace(
          scriptMatch[1],
          `${scriptMatch[1]}\nimport InlineSVG from 'vue-inline-svg'`
        )
      }
    }

    if (!dryRun && changes > 0) {
      writeFileSync(vueFilePath, newContent, 'utf-8')
    }

    return {
      changes,
      preview: dryRun ? newContent : undefined
    }
  } catch (error) {
    return {
      changes: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// ==================== MCP Server 設定 ====================

const server = new Server(
  {
    name: 'vue-svg-refactor',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

// 列出可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools }
})

// 處理工具呼叫
server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params

  if (!args) {
    throw new Error('Missing arguments')
  }

  try {
    switch (name) {
      case 'analyze_svg_usage': {
        const result = analyzeSvgUsage(args.projectPath as string)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      case 'find_duplicate_svgs': {
        const result = findDuplicateSvgs(
          args.projectPath as string,
          args.minUsageCount as number
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      case 'suggest_svg_components': {
        const duplicates = findDuplicateSvgs(args.projectPath as string, 2)
        const suggestions = duplicates.map(d => ({
          componentName: path
            .basename(d.svgPath, '.svg')
            .split(/[-_]/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('') + 'Icon',
          svgPath: d.svgPath,
          usageCount: d.usageCount,
          priority: d.usageCount >= 5 ? 'high' : d.usageCount >= 3 ? 'medium' : 'low'
        }))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(suggestions, null, 2)
            }
          ]
        }
      }

      case 'generate_svg_component': {
        const result = generateSvgComponent(
          args.svgPath as string,
          args.componentName as string,
          args.outputPath as string
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      case 'ensure_current_color': {
        const result = ensureCurrentColor(
          args.svgPath as string,
          args.autoFix as boolean
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      case 'convert_img_to_inline': {
        const result = convertImgToInline(
          args.vueFilePath as string,
          args.dryRun as boolean
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    }
  }
})

// 啟動 server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Vue SVG Refactor MCP Server running on stdio')
}

main().catch(console.error)
