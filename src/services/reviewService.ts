import { CodeReview, CodeIssue } from './aiService';
import GitService from './gitService';
import AIService from './aiService';
import StandardsService from './standardsService';

export interface ReviewProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  status: 'idle' | 'cloning' | 'analyzing' | 'completed' | 'error';
  error?: string;
}

export interface ReviewResult {
  id: string;
  repository: string;
  branch: string;
  standards: string;
  reviews: CodeReview[];
  summary: ReviewSummary;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export interface ReviewSummary {
  totalFiles: number;
  totalIssues: number;
  issuesByType: Record<string, number>;
  issuesByCategory: Record<string, number>;
  filesWithIssues: number;
}

export class ReviewService {
  private static instance: ReviewService;
  private progress: ReviewProgress = {
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    status: 'idle'
  };
  
  private progressCallbacks: Array<(progress: ReviewProgress) => void> = [];
  private logCallbacks: Array<(level: 'info' | 'warning' | 'error', message: string, details?: string) => void> = [];

  public static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  // 注册进度回调
  onProgress(callback: (progress: ReviewProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  onLog(callback: (level: 'info' | 'warning' | 'error', message: string, details?: string) => void): void {
    this.logCallbacks.push(callback);
  }

  // 更新进度
  private updateProgress(updates: Partial<ReviewProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.progressCallbacks.forEach(callback => callback(this.progress));
  }

  private emitLog(level: 'info' | 'warning' | 'error', message: string, details?: string): void {
    this.logCallbacks.forEach(cb => cb(level, message, details));
  }

  // 执行代码审查
  async executeReview(
    repositoryUrl: string,
    branch: string,
    standardsContent: string
  ): Promise<ReviewResult> {
    const startTime = new Date();
    
    try {
      this.updateProgress({ 
        status: 'cloning', 
        totalFiles: 0, 
        processedFiles: 0,
        currentFile: '正在获取仓库代码...'
      });

      // 1. 获取仓库代码
      const gitService = GitService.getInstance();
      const cloneResult = await gitService.cloneRepository(repositoryUrl, branch, './temp_repo');
      this.emitLog('info', '代码获取', cloneResult);

      // 2. 获取代码文件列表
      this.updateProgress({ currentFile: '正在扫描代码文件...' });
      const codeFiles = await gitService.getCodeFiles('./temp_repo');
      
      if (codeFiles.length === 0) {
        throw new Error('未找到代码文件');
      }
      
      this.updateProgress({ totalFiles: codeFiles.length, currentFile: `找到${codeFiles.length}个代码文件` });
      this.emitLog('info', '文件列表', `${codeFiles.length} 个文件`);

      // 3. 分析代码文件
      this.updateProgress({ status: 'analyzing' });
      const aiService = AIService.getInstance();
      const reviews: CodeReview[] = [];

      for (let i = 0; i < codeFiles.length; i++) {
        const filePath = codeFiles[i];
        this.updateProgress({
          currentFile: filePath,
          processedFiles: i
        });

        try {
          const content = await gitService.readFileContent(filePath);
          if (!content.trim()) {
            this.emitLog('warning', '空文件跳过', filePath);
            continue; // 跳过空文件
          }
          
          const language = this.detectLanguage(filePath);
          this.emitLog('info', '语言检测', `${filePath} -> ${language}`);
          
          // 分析文件
          const review = await this.analyzeFile(aiService, filePath, content, language, standardsContent);
          reviews.push(review);
          this.emitLog('info', '分析完成', `${filePath} -> 问题 ${review.issues.length}`);
          
          // 避免API调用过于频繁
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`审查文件失败: ${filePath}`, error);
          this.emitLog('error', '文件审查失败', `${filePath} - ${error instanceof Error ? error.message : '未知错误'}`);
          reviews.push({
            file: filePath,
            issues: [],
            summary: `审查失败: ${error instanceof Error ? error.message : '未知错误'}`
          });
        }
      }

      // 4. 生成总结
      const summary = this.generateSummary(reviews);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.emitLog('info', '审查完成', `分析 ${summary.totalFiles} 文件，发现 ${summary.totalIssues} 问题`);

      const result: ReviewResult = {
        id: Date.now().toString(),
        repository: repositoryUrl,
        branch: branch,
        standards: standardsContent,
        reviews: reviews,
        summary: summary,
        startTime: startTime,
        endTime: endTime,
        duration: duration
      };

      this.updateProgress({ 
        status: 'completed',
        currentFile: '审查完成'
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '审查过程出错';
      this.updateProgress({ 
        status: 'error',
        error: errorMessage
      });
      this.emitLog('error', '审查过程出错', errorMessage);
      throw error;
    }
  }

  // 分析单个文件
  private async analyzeFile(
    aiService: AIService,
    filePath: string,
    content: string,
    language: string,
    standardsContent: string
  ): Promise<CodeReview> {
    try {
      // 文件大小检查
      if (content.length > 50000) {
        this.emitLog('warning', '文件过大跳过', `${filePath} (${(content.length / 1024).toFixed(1)}KB)`);
        return {
          file: filePath,
          issues: [],
          summary: '文件过大，跳过分析'
        };
      }

      // 基础代码检查
      const basicIssues = this.performBasicCodeCheck(filePath, content, language);
      this.emitLog('info', '基础检查', `${filePath} -> ${basicIssues.length} 问题`);
      
      // AI深度分析
      const aiReview = await aiService.reviewCode(filePath, content, language, standardsContent, (phase, info) => {
        this.emitLog('info', phase, info);
      });
      
      // 合并基础检查和AI分析结果
      const allIssues = [...basicIssues, ...aiReview.issues];
      
      return {
        file: filePath,
        issues: allIssues,
        summary: `发现${allIssues.length}个问题`
      };
      
    } catch (error) {
      console.error(`AI分析失败: ${filePath}`, error);
      
      // 如果AI分析失败，至少返回基础检查结果
      const basicIssues = this.performBasicCodeCheck(filePath, content, language);
      this.emitLog('error', 'AI分析失败', filePath);
      return {
        file: filePath,
        issues: basicIssues,
        summary: `基础检查完成，发现${basicIssues.length}个问题 (AI分析失败)`
      };
    }
  }

  // 基础代码检查
  private performBasicCodeCheck(filePath: string, content: string, language: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    // 检查空行和格式问题
    lines.forEach((line, index) => {
      // 检查行尾空格
      if (line.endsWith(' ') || line.endsWith('\t')) {
        issues.push({
          line: index + 1,
          type: 'style',
          category: 'maintainability',
          message: '行尾存在多余空格或制表符',
          suggestion: '删除行尾的空格和制表符',
          code: line,
          context: this.getContextLines(lines, index)
        });
      }

      // 检查过长的行
      if (line.length > 120) {
        issues.push({
          line: index + 1,
          type: 'warning',
          category: 'readability',
          message: '代码行过长，建议不超过120个字符',
          suggestion: '将长行拆分为多行，提高可读性',
          code: line,
          context: this.getContextLines(lines, index)
        });
      }

      // 检查TODO注释
      if (line.toLowerCase().includes('todo') || line.toLowerCase().includes('fixme')) {
        issues.push({
          line: index + 1,
          type: 'info',
          category: 'maintainability',
          message: '存在TODO/FIXME注释',
          suggestion: '及时处理TODO事项或创建任务跟踪',
          code: line,
          context: this.getContextLines(lines, index)
        });
      }

      // 检查console语句（生产代码）
      if (line.toLowerCase().includes('console.') && !line.includes('//')) {
        issues.push({
          line: index + 1,
          type: 'warning',
          category: 'best-practices',
          message: '代码中包含console语句',
          suggestion: '生产代码中应移除调试用的console语句',
          code: line,
          context: this.getContextLines(lines, index)
        });
      }
    });

    // 检查文件末尾空行
    if (content.length > 0 && !content.endsWith('\n')) {
      issues.push({
        line: lines.length,
        type: 'style',
        category: 'maintainability',
        message: '文件末尾缺少空行',
        suggestion: '在文件末尾添加一个空行',
        code: lines[lines.length - 1],
        context: lines.slice(-2)
      });
    }

    // 检查函数复杂度（简单的圈复杂度检查）
    const functionMatches = content.match(/function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>|class\s+\w+/g);
    if (functionMatches && functionMatches.length > 10) {
      issues.push({
        line: 1,
        type: 'warning',
        category: 'maintainability',
        message: '文件中定义了过多的函数/类',
        suggestion: '考虑将代码拆分到多个文件中，每个文件专注一个功能',
        code: lines[0],
        context: lines.slice(0, 3)
      });
    }

    return issues;
  }

  // 获取上下文行
  private getContextLines(lines: string[], lineIndex: number, contextSize: number = 2): string[] {
    const start = Math.max(0, lineIndex - contextSize);
    const end = Math.min(lines.length, lineIndex + contextSize + 1);
    return lines.slice(start, end);
  }

  // 检测编程语言
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'kt': 'kotlin',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'vue': 'vue',
      'svelte': 'svelte'
    };
    
    return languageMap[ext || ''] || 'text';
  }

  // 生成审查总结
  private generateSummary(reviews: CodeReview[]): ReviewSummary {
    const summary: ReviewSummary = {
      totalFiles: reviews.length,
      totalIssues: 0,
      issuesByType: {},
      issuesByCategory: {},
      filesWithIssues: 0
    };

    reviews.forEach(review => {
      if (review.issues.length > 0) {
        summary.filesWithIssues++;
        summary.totalIssues += review.issues.length;

        review.issues.forEach(issue => {
          // 按类型统计
          summary.issuesByType[issue.type] = (summary.issuesByType[issue.type] || 0) + 1;
          
          // 按类别统计
          summary.issuesByCategory[issue.category] = (summary.issuesByCategory[issue.category] || 0) + 1;
        });
      }
    });

    return summary;
  }

  // 获取当前进度
  getProgress(): ReviewProgress {
    return this.progress;
  }

  // 重置进度
  resetProgress(): void {
    this.progress = {
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      status: 'idle'
    };
  }
}

// 日志函数
function addLog(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  console.log(`[${new Date().toLocaleTimeString()}] [${level.toUpperCase()}] ${message}`);
}

export default ReviewService;