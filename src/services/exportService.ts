import { saveAs } from 'file-saver';
import { CodeReview, CodeIssue } from './aiService';
import { ReviewResult, ReviewSummary } from './reviewService';

export class ExportService {
  private static instance: ExportService;

  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  // 导出为Markdown格式
  exportToMarkdown(result: ReviewResult): void {
    const content = this.generateMarkdownContent(result);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const filename = `code-review-${new Date().toISOString().split('T')[0]}.md`;
    saveAs(blob, filename);
  }

  // 导出为HTML格式
  exportToHTML(result: ReviewResult): void {
    const content = this.generateHTMLContent(result);
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const filename = `code-review-${new Date().toISOString().split('T')[0]}.html`;
    saveAs(blob, filename);
  }

  // 导出为JSON格式
  exportToJSON(result: ReviewResult): void {
    const content = JSON.stringify(result, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const filename = `code-review-${new Date().toISOString().split('T')[0]}.json`;
    saveAs(blob, filename);
  }

  // 生成Markdown内容
  private generateMarkdownContent(result: ReviewResult): string {
    let content = `# 代码审查报告

## 基本信息
- **仓库地址**: ${result.repository}
- **分支**: ${result.branch}
- **审查时间**: ${result.startTime.toLocaleString('zh-CN')}
- **总耗时**: ${result.duration ? `${Math.round(result.duration / 1000)}秒` : '未知'}

## 统计概览
- **总文件数**: ${result.summary.totalFiles}
- **总问题数**: ${result.summary.totalIssues}
- **问题文件数**: ${result.summary.filesWithIssues}
- **无问题文件数**: ${result.summary.totalFiles - result.summary.filesWithIssues}

### 问题类型分布
`;

    Object.entries(result.summary.issuesByType).forEach(([type, count]) => {
      content += `- **${type}**: ${count}个\n`;
    });

    content += `
### 问题类别分布
`;

    Object.entries(result.summary.issuesByCategory).forEach(([category, count]) => {
      content += `- **${category}**: ${count}个\n`;
    });

    content += `
## 详细问题

`;

    result.reviews.filter(review => review.issues.length > 0).forEach((review) => {
      content += `### ${review.file}\n`;
      content += `**问题数量**: ${review.issues.length}个\n\n`;

      review.issues.forEach((issue, index) => {
        content += `#### ${index + 1}. ${issue.message}\n`;
        content += `- **类型**: ${issue.type}\n`;
        content += `- **类别**: ${issue.category}\n`;
        content += `- **位置**: 第${issue.line}行${issue.column ? `, 第${issue.column}列` : ''}\n`;
        content += `- **建议**: ${issue.suggestion}\n\n`;
        
        if (issue.context.length > 0) {
          content += '**代码上下文**:\n```javascript\n';
          issue.context.forEach((line, lineIndex) => {
            content += `${lineIndex + 1}: ${line}\n`;
          });
          content += '```\n\n';
        }
      });

      content += '\n---\n\n';
    });

    content += `
## 开发规范
\`\`\`
${result.standards}
\`\`\`

---
*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
`;

    return content;
  }

  // 生成HTML内容
  private generateHTMLContent(result: ReviewResult): string {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>代码审查报告 - ${new Date().toLocaleDateString('zh-CN')}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 30px;
        }
        .header {
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .title {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid #007bff;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #007bff;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
        .file-section {
            margin-bottom: 30px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
        }
        .file-header {
            background: #f8f9fa;
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
            font-weight: bold;
        }
        .issue {
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
        }
        .issue:last-child {
            border-bottom: none;
        }
        .issue-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        .issue-type {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 10px;
        }
        .error { background-color: #fee; color: #c33; }
        .warning { background-color: #ffeaa7; color: #d68910; }
        .info { background-color: #e3f2fd; color: #1976d2; }
        .code-context {
            background: #f4f4f4;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 10px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
        }
        .suggestion {
            background: #e3f2fd;
            border: 1px solid #bbdefb;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">代码审查报告</h1>
            <p><strong>仓库地址:</strong> ${result.repository}</p>
            <p><strong>分支:</strong> ${result.branch}</p>
            <p><strong>审查时间:</strong> ${result.startTime.toLocaleString('zh-CN')}</p>
            ${result.duration ? `<p><strong>总耗时:</strong> ${Math.round(result.duration / 1000)}秒</p>` : ''}
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${result.summary.totalFiles}</div>
                <div class="stat-label">总文件数</div>
            </div>
            <div class="stat-card" style="border-left-color: #dc3545;">
                <div class="stat-number" style="color: #dc3545;">${result.summary.totalIssues}</div>
                <div class="stat-label">总问题数</div>
            </div>
            <div class="stat-card" style="border-left-color: #ffc107;">
                <div class="stat-number" style="color: #ffc107;">${result.summary.filesWithIssues}</div>
                <div class="stat-label">问题文件数</div>
            </div>
            <div class="stat-card" style="border-left-color: #28a745;">
                <div class="stat-number" style="color: #28a745;">${result.summary.totalFiles - result.summary.filesWithIssues}</div>
                <div class="stat-label">无问题文件</div>
            </div>
        </div>

        <h2>详细问题分析</h2>
        
        ${result.reviews.filter(review => review.issues.length > 0).map(review => `
        <div class="file-section">
            <div class="file-header">
                ${review.file} (${review.issues.length}个问题)
            </div>
            
            ${review.issues.map(issue => `
            <div class="issue">
                <div class="issue-header">
                    <span class="issue-type ${issue.type}">${issue.type.toUpperCase()}</span>
                    <span><strong>位置:</strong> 第${issue.line}行${issue.column ? `, 第${issue.column}列` : ''}</span>
                    <span style="margin-left: 10px;"><strong>类别:</strong> ${issue.category}</span>
                </div>
                
                <p><strong>问题:</strong> ${issue.message}</p>
                
                ${issue.context.length > 0 ? `
                <div class="code-context">
                    ${issue.context.map((line, idx) => `${idx + 1}: ${line}`).join('<br>')}
                </div>
                ` : ''}
                
                <div class="suggestion">
                    <strong>建议:</strong> ${issue.suggestion}
                </div>
            </div>
            `).join('')}
        </div>
        `).join('')}

        <div class="footer">
            <p>报告生成时间: ${new Date().toLocaleString('zh-CN')}</p>
            <p>使用AI代码审查工具生成</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }
}

export default ExportService;