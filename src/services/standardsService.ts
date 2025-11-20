export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  uploadTime: Date;
  previewUrl?: string;
  parsedText?: string;
}

export interface FileParser {
  canParse(fileType: string): boolean;
  parse(content: ArrayBuffer): Promise<string>;
}

export class StandardsService {
  private static instance: StandardsService;
  private uploadedFiles: Map<string, UploadedFile> = new Map();
  private maxSizeBytes = 50 * 1024 * 1024;

  public static getInstance(): StandardsService {
    if (!StandardsService.instance) {
      StandardsService.instance = new StandardsService();
    }
    return StandardsService.instance;
  }

  // 支持的文件类型
  getSupportedFileTypes(): string[] {
    return [
      'text/markdown',
      'text/plain',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
  }

  // 验证文件
  validateFile(file: File): { valid: boolean; error?: string } {
    const supportedTypes = this.getSupportedFileTypes();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (file.size > this.maxSizeBytes) {
      return { valid: false, error: '文件大小超过50MB限制' };
    }

    const acceptByExt = ['md','txt','json','pdf','doc','docx','xls','xlsx'].includes(ext);
    const acceptByType = supportedTypes.includes(file.type);

    if (!acceptByExt && !acceptByType) {
      return { valid: false, error: '不支持的文件格式' };
    }

    return { valid: true };
  }

  // 读取文件内容
  async readFile(file: File, onProgress?: (percent: number) => void): Promise<{ text?: string; buffer?: ArrayBuffer }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onprogress = (e: ProgressEvent<FileReader>) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      reader.onload = (e) => {
        const result = e.target?.result;
        const isText = this.isTextFile(file);
        if (isText) {
          resolve({ text: result as string });
        } else {
          resolve({ buffer: result as ArrayBuffer });
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      if (this.isTextFile(file)) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  private isTextFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return ['md','txt','json'].includes(ext) || file.type.startsWith('text/');
  }

  // 上传文件
  async uploadFile(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const readResult = await this.readFile(file, onProgress);
    const content = readResult.text ?? '';
    const uploadedFile: UploadedFile = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      type: file.type,
      content,
      uploadTime: new Date()
    };

    if (readResult.buffer) {
      const parsed = await this.parseBinaryFile(file, readResult.buffer);
      uploadedFile.parsedText = parsed.text;
      uploadedFile.previewUrl = parsed.previewUrl;
    } else if (this.isTextFile(file)) {
      uploadedFile.parsedText = this.parseStandardsDocument(content, file.type || 'text/plain');
    }

    this.uploadedFiles.set(uploadedFile.id, uploadedFile);
    return uploadedFile;
  }

  // 获取已上传的文件
  getUploadedFile(id: string): UploadedFile | undefined {
    return this.uploadedFiles.get(id);
  }

  // 获取所有已上传的文件
  getAllUploadedFiles(): UploadedFile[] {
    return Array.from(this.uploadedFiles.values());
  }

  // 删除文件
  deleteFile(id: string): boolean {
    return this.uploadedFiles.delete(id);
  }

  // 解析开发规范文档
  parseStandardsDocument(content: string, type: string): string {
    // 简单的文档解析逻辑
    if (type === 'text/markdown' || content.includes('#')) {
      return this.parseMarkdown(content);
    }
    
    return content;
  }

  private async parseBinaryFile(file: File, buffer: ArrayBuffer): Promise<{ text?: string; previewUrl?: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      return { previewUrl: url };
    }
    if (ext === 'docx') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (!docXml) return { text: '' };
      const text = docXml
        .replace(/<w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      return { text };
    }
    if (ext === 'xlsx') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer);
      const sharedStrings = await zip.file('xl/sharedStrings.xml')?.async('string');
      const sheet1 = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
      let text = '';
      if (sharedStrings) {
        const matches = Array.from(sharedStrings.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map(m => m[1]);
        text += matches.slice(0, 50).join('\n');
      }
      if (sheet1 && !text) {
        const cells = Array.from(sheet1.matchAll(/<v>([\s\S]*?)<\/v>/g)).map(m => m[1]);
        text += cells.slice(0, 50).join('\n');
      }
      return { text: text.trim() };
    }
    return { text: '' };
  }

  // 简单的Markdown解析
  private parseMarkdown(content: string): string {
    // 移除Markdown标记，提取纯文本
    return content
      .replace(/^#+\s+/gm, '') // 移除标题标记
      .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
      .replace(/\*(.*?)\*/g, '$1') // 移除斜体
      .replace(/`(.*?)`/g, '$1') // 移除代码标记
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .trim();
  }

  // 生成示例开发规范
  generateSampleStandards(): string {
    return `# 前端开发规范

## 命名规范
- 变量名使用camelCase
- 常量名使用UPPER_SNAKE_CASE
- 组件名使用PascalCase

## 代码结构
- 每个函数不超过50行
- 避免嵌套超过3层
- 使用早期返回减少嵌套

## 性能优化
- 避免不必要的重新渲染
- 使用适当的缓存策略
- 优化图片和资源加载

## 安全规范
- 验证所有用户输入
- 避免XSS攻击
- 使用HTTPS通信`;
  }
}

export default StandardsService;