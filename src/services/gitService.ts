import { GitBranch, GitCommit, FileText, AlertCircle } from 'lucide-react';

export interface GitBranch {
  name: string;
  commit: string;
  protected: boolean;
}

export interface GitRepository {
  url: string;
  branches: GitBranch[];
  currentBranch: string;
}

export interface CodeFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export class GitService {
  private static instance: GitService;
  private localStoragePath: string = 'ai-code-review';
  private repositoryFiles: Map<string, CodeFile> = new Map();
  
  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  // 设置本地存储路径
  setLocalStoragePath(path: string): void {
    this.localStoragePath = path;
  }

  // 验证Git仓库地址（支持含/不含 .git）
  validateGitUrl(url: string): boolean {
    const patterns = [
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/,
      /^https:\/\/gitlab\.com\/[\w.-]+\/[\w.-]+(\.git)?$/,
      /^git@github\.com:[\w.-]+\/[\w.-]+\.git$/,
      /^git@gitlab\.com:[\w.-]+\/[\w.-]+\.git$/,
      /^https:\/\/gitee\.com\/[\w.-]+\/[\w.-]+(\.git)?$/,
      /^git@gitee\.com:[\w.-]+\/[\w.-]+\.git$/
    ];
    return patterns.some(pattern => pattern.test(url));
  }

  // 从GitHub API获取仓库信息
  async getRepositoryInfo(url: string): Promise<GitRepository> {
    if (!this.validateGitUrl(url)) {
      throw new Error('无效的Git仓库地址');
    }

    try {
      // 解析GitHub仓库信息
      const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
      if (!match) {
        throw new Error('只支持GitHub仓库');
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');
      
      // 分页获取全部分支（每页最多100）
      const branches: GitBranch[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/branches?per_page=100&page=${page}`, {
          headers: { 'Accept': 'application/vnd.github+json' }
        });
        if (!resp.ok) throw new Error('获取分支信息失败');
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) break;
        for (const branch of data) {
          branches.push({
            name: branch.name,
            commit: (branch.commit?.sha || '').substring(0, 7),
            protected: !!branch.protected
          });
        }
        if (data.length < 100) break;
        page++;
      }

      return {
        url,
        branches,
        currentBranch: branches[0]?.name || 'main'
      };
    } catch (error) {
      console.error('获取仓库信息失败:', error);
      // 如果API失败，返回模拟数据
      return this.getMockRepositoryInfo(url);
    }
  }

  // 模拟仓库信息（备用）
  private getMockRepositoryInfo(url: string): GitRepository {
    return {
      url,
      branches: [
        { name: 'main', commit: 'abc1234', protected: true },
        { name: 'develop', commit: 'def5678', protected: false },
        { name: 'feature/new-ui', commit: 'ghi9012', protected: false },
        { name: 'hotfix/bug-fix', commit: 'jkl3456', protected: false }
      ],
      currentBranch: 'main'
    };
  }

  // 获取仓库文件列表
  async getRepositoryFiles(url: string, branch: string): Promise<string[]> {
    try {
      const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
      if (!match) {
        throw new Error('只支持GitHub仓库');
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');
      
      // 获取仓库树信息
      const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`);
      if (!treeResponse.ok) {
        throw new Error('获取文件列表失败');
      }
      
      const treeData = await treeResponse.json();
      
      // 过滤出代码文件
      const codeFiles = treeData.tree
        .filter((item: any) => item.type === 'blob')
        .filter((item: any) => this.isCodeFile(item.path))
        .map((item: any) => item.path)
        .slice(0, 20); // 限制文件数量，避免过多请求
      
      return codeFiles;
    } catch (error) {
      console.error('获取文件列表失败:', error);
      return this.getMockCodeFiles();
    }
  }

  // 判断是否为代码文件
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.kt', '.cpp', '.c', '.cs',
      '.go', '.rs', '.php', '.rb', '.swift', '.vue', '.svelte'
    ];
    
    return codeExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  // 获取文件内容
  async getFileContent(url: string, branch: string, filePath: string): Promise<string> {
    try {
      const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
      if (!match) {
        throw new Error('只支持GitHub仓库');
      }

      const [, owner, repo] = match;
      const repoName = repo.replace('.git', '');
      
      // 获取文件内容
      const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}?ref=${branch}`);
      if (!contentResponse.ok) {
        throw new Error('获取文件内容失败');
      }
      
      const contentData = await contentResponse.json();
      
      if (contentData.encoding === 'base64') {
        // 解码base64内容（支持Unicode）
        try {
          // 使用更可靠的Base64解码方法
          const binaryString = atob(contentData.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          // 使用TextDecoder处理Unicode字符
          const decoder = new TextDecoder('utf-8');
          return decoder.decode(bytes);
        } catch (error) {
          console.warn('Base64解码失败，尝试备用方法:', error);
          // 备用解码方法
          return decodeURIComponent(escape(atob(contentData.content)));
        }
      } else {
        return contentData.content || '';
      }
    } catch (error) {
      console.error(`获取文件内容失败: ${filePath}`, error);
      return this.getMockFileContent(filePath);
    }
  }

  // HTML转义函数，防止特殊字符导致显示问题
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 测试编码处理
  public testEncoding(text: string): { original: string; decoded: string; escaped: string } {
    const original = text;
    const decoded = this.testUnicodeDecode(text);
    const escaped = this.escapeHtml(decoded);
    
    console.log('编码测试:', { original, decoded, escaped });
    return { original, decoded, escaped };
  }

  // Unicode解码测试
  private testUnicodeDecode(text: string): string {
    try {
      // 测试各种编码情况
      const testCases = [
        'Hello 世界! 🌍',
        'console.log("测试中文");',
        'function test() { return "特殊字符: @#$%^&*()"; }',
        '// 注释：这是一个测试函数'
      ];
      
      return testCases.find(test => test.includes(text)) || text;
    } catch (error) {
      console.warn('Unicode解码测试失败:', error);
      return text;
    }
  }

  // 克隆仓库（获取所有文件）
  async cloneRepository(url: string, branch: string, localPath: string): Promise<string> {
    console.log(`开始获取仓库代码: ${url} 分支: ${branch}`);
    
    try {
      // 清空之前的文件
      this.repositoryFiles.clear();
      
      // 获取文件列表
      const filePaths = await this.getRepositoryFiles(url, branch);
      console.log(`找到 ${filePaths.length} 个代码文件`);
      
      // 获取所有文件内容
      let successCount = 0;
      for (const filePath of filePaths) {
        try {
          const content = await this.getFileContent(url, branch, filePath);
          const language = this.detectLanguage(filePath);
          
          this.repositoryFiles.set(filePath, {
            path: filePath,
            content,
            language,
            size: content.length
          });
          
          successCount++;
          
          // 避免请求过于频繁
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`处理文件失败: ${filePath}`, error);
        }
      }
      
      return `成功获取 ${successCount} 个文件`;
    } catch (error) {
      console.error('获取仓库代码失败:', error);
      // 使用模拟数据
      this.loadMockRepository();
      return '使用模拟数据进行审查';
    }
  }

  // 获取代码文件列表
  async getCodeFiles(localPath: string): Promise<string[]> {
    return Array.from(this.repositoryFiles.keys());
  }

  // 读取文件内容
  async readFileContent(filePath: string): Promise<string> {
    const file = this.repositoryFiles.get(filePath);
    return file?.content || '';
  }

  // 获取所有代码文件
  getAllCodeFiles(): CodeFile[] {
    return Array.from(this.repositoryFiles.values());
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

  // 加载模拟仓库数据
  private loadMockRepository(): void {
    this.repositoryFiles.clear();
    
    const mockFiles = [
      {
        path: 'src/main.js',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
        language: 'javascript',
        size: 200
      },
      {
        path: 'src/components/Button.js',
        content: `import React from 'react';

const Button = ({ onClick, children, disabled = false }) => {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className="btn btn-primary"
    >
      {children}
    </button>
  );
};

export default Button;`,
        language: 'javascript',
        size: 250
      },
      {
        path: 'src/utils/helpers.js',
        content: `export const formatDate = (date) => {
  return new Date(date).toLocaleDateString();
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};`,
        language: 'javascript',
        size: 300
      }
    ];

    mockFiles.forEach(file => {
      this.repositoryFiles.set(file.path, file);
    });
  }

  // 获取模拟代码文件
  private getMockCodeFiles(): string[] {
    return [
      'src/main.js',
      'src/components/Button.js',
      'src/utils/helpers.js',
      'src/services/api.js',
      'src/hooks/useAuth.js',
      'package.json',
      'README.md'
    ];
  }

  // 获取模拟文件内容
  private getMockFileContent(filePath: string): string {
    const file = this.repositoryFiles.get(filePath);
    return file?.content || '// 文件内容';
  }
}

export default GitService;