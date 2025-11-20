# 文件上传

## 功能说明
- 支持上传 PDF、Word(.doc/.docx)、Excel(.xls/.xlsx)、Markdown(.md)、文本(.txt)、JSON(.json)
- 单文件大小限制 50MB，超出限制会被拒绝
- 前端进行类型校验与大小校验，上传过程展示进度条
- 已上传文件列表展示：文件名、大小、上传时间
- 预览能力：
  - PDF 通过浏览器内置预览（生成 Blob URL）
  - DOCX 解析正文并展示纯文本
  - XLSX 抽取共享字符串与部分单元格值作为预览文本
  - 其他文本类型直接展示内容

## 接口定义

### StandardsService
- `getSupportedFileTypes(): string[]` 返回支持的 MIME 类型列表
- `validateFile(file: File): { valid: boolean; error?: string }` 文件校验（类型、大小）
- `uploadFile(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile>` 上传并解析，支持进度回调
- `getAllUploadedFiles(): UploadedFile[]` 获取已上传文件列表
- `parseStandardsDocument(content: string, type: string): string` 文本类规范解析

### UploadedFile
- `id: string` 唯一标识
- `name: string` 文件名
- `size: number` 文件大小（字节）
- `type: string` MIME 类型
- `content: string` 原始文本内容（文本文件）
- `parsedText?: string` 解析后的文本（DOCX/XLSX等）
- `previewUrl?: string` 预览地址（PDF 等）
- `uploadTime: Date` 上传时间

## 使用示例

```ts
import StandardsService from '../src/services/standardsService';

const standards = StandardsService.getInstance();

inputEl.onchange = async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files) return;
  for (const file of Array.from(files)) {
    const uploaded = await standards.uploadFile(file, (p) => {
      console.log('progress', file.name, p);
    });
    console.log(uploaded.parsedText || uploaded.content);
    console.log(uploaded.previewUrl);
  }
};
```

## 使用限制
- 单文件不超过 50MB；超出则返回错误
- .doc（旧版 Word）与 .xls（旧版 Excel）不进行内容解析，仅保留原文件与基础信息
- XLSX 预览为抽取的共享字符串与部分单元格文本，并非完整表格渲染

## 最佳实践
- 优先上传结构化的 Markdown/TXT/JSON 作为开发规范，便于 AI 分析
- 大文档建议拆分为章节上传，避免超大文件影响性能
- PDF 预览通过新窗口打开 Blob URL，便于查看

## 常见问题
- Q: 上传后无预览内容？
  - A: 检查文件类型是否为支持解析的类型（PDF/DOCX/XLSX/文本）。对于 .doc/.xls 仅支持基础信息展示。
- Q: 进度不显示？
  - A: 请确认在调用 `uploadFile` 时传入了 `onProgress` 回调，并在 UI 中读取对应状态。