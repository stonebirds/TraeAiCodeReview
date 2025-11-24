export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  maxTokens: number;
  supported: boolean;
}

export interface CodeReview {
  file: string;
  issues: CodeIssue[];
  summary: string;
}

export interface CodeIssue {
  line: number;
  column?: number;
  type: 'error' | 'warning' | 'info' | 'style';
  category: 'security' | 'performance' | 'maintainability' | 'readability' | 'best-practices';
  message: string;
  suggestion: string;
  code: string;
  context: string[];
}

export class AIService {
  private static instance: AIService;
  private apiKey: string = '';
  private model: AIModel | null = null;
  private connectionMode: 'auto' | 'direct' | 'proxy' = 'auto';
  private proxyUrl: string = '';
  private requestCountByModel: Record<string, number> = {};
  private lastRequestAtByModel: Record<string, number> = {};
  private warnedProviders: Set<string> = new Set();
  private stats: { success: number; fail: number; lastError?: string } = { success: 0, fail: 0 };

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  getAvailableModels(): AIModel[] {
    return [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'DeepSeek',
        description: '专为代码审查优化的模型',
        maxTokens: 32768,
        supported: true
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        description: '强大的通用语言模型',
        maxTokens: 8192,
        supported: true
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'Anthropic',
        description: '专注于代码理解和分析',
        maxTokens: 200000,
        supported: true
      },
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        provider: 'Moonshot',
        description: '中文友好的代码分析模型',
        maxTokens: 200000,
        supported: true
      },
      {
        id: 'doubao-pro',
        name: '豆包Pro',
        provider: 'ByteDance',
        description: '企业级代码审查模型',
        maxTokens: 32768,
        supported: true
      }
    ];
  }

  setConnectionMode(mode: 'auto' | 'direct' | 'proxy'): void {
    this.connectionMode = mode;
  }

  setProxyUrl(url: string): void {
    this.proxyUrl = url.trim();
  }

  getStats(): { success: number; fail: number; lastError?: string } {
    return { ...this.stats };
  }

  private getProviderConfig(modelId: string) {
    const map: Record<string, { type: 'openai' | 'deepseek' | 'anthropic' | 'moonshot' | 'doubao', urls: string[], headerAuth: string, minIntervalMs: number, corsSupported?: boolean }> = {
      'gpt-4': { type: 'openai', urls: ['https://api.openai.com/v1/chat/completions'], headerAuth: 'Authorization', minIntervalMs: 1000, corsSupported: false },
      'deepseek-chat': { type: 'deepseek', urls: ['https://api.deepseek.com/v1/chat/completions'], headerAuth: 'Authorization', minIntervalMs: 1000, corsSupported: false },
      'claude-3-sonnet': { type: 'anthropic', urls: ['https://api.anthropic.com/v1/messages'], headerAuth: 'x-api-key', minIntervalMs: 1000, corsSupported: false },
      'kimi-k2': { type: 'moonshot', urls: ['https://api.moonshot.cn/v1/chat/completions','https://api.moonshot.ai/v1/chat/completions'], headerAuth: 'Authorization', minIntervalMs: 1000, corsSupported: false },
      'doubao-pro': { type: 'doubao', urls: ['https://api.doubao.com/v1/chat/completions'], headerAuth: 'Authorization', minIntervalMs: 1000, corsSupported: false }
    };
    return map[modelId];
  }

  private async enforceRateLimit(modelId: string) {
    const now = Date.now();
    const last = this.lastRequestAtByModel[modelId] || 0;
    const cfg = this.getProviderConfig(modelId);
    const minInterval = cfg?.minIntervalMs || 500;
    const diff = now - last;
    if (diff < minInterval) {
      await new Promise(r => setTimeout(r, minInterval - diff));
    }
    this.lastRequestAtByModel[modelId] = Date.now();
    this.requestCountByModel[modelId] = (this.requestCountByModel[modelId] || 0) + 1;
  }

  private maskSensitive(text: string): string {
    const patterns = [
      /(?<=access[_-]?key\s*[:=]\s*)[A-Za-z0-9_\-]+/gi,
      /(?<=secret[_-]?key\s*[:=]\s*)[A-Za-z0-9_\-]+/gi,
      /(?<=token\s*[:=]\s*)[A-Za-z0-9\._\-]+/gi,
      /(?<=password\s*[:=]\s*)[^\s"']+/gi,
      /AKIA[0-9A-Z]{16}/g
    ];
    let masked = text;
    patterns.forEach(rx => { masked = masked.replace(rx, '***'); });
    return masked;
  }

  private buildPrompt(filePath: string, code: string, language: string, standards: string): string {
    const header = `你是代码审查专家。严格依据以下开发规范进行审查，并只返回JSON：\n`;
    const std = standards.slice(0, 8000);
    const body = `文件: ${filePath}\n语言: ${language}\n请输出如下JSON数组，每项为问题：{ line, type, category, message, suggestion, code, context }，且仅返回JSON。`;
    const content = `规范:\n${std}\n---\n代码:\n${code.substring(0, 15000)}`;
    return `${header}${body}\n${content}`;
  }

  private normalizeIssuesFromText(text: string, filePath: string, code: string): CodeIssue[] {
    try {
      const trimmed = text.trim();
      const jsonStart = trimmed.indexOf('[');
      const jsonEnd = trimmed.lastIndexOf(']');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const json = trimmed.substring(jsonStart, jsonEnd + 1);
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) {
          return arr.map((x: any) => ({
            line: Number(x.line) || 1,
            column: x.column ? Number(x.column) : undefined,
            type: ['error','warning','info','style'].includes(x.type) ? x.type : 'info',
            category: ['security','performance','maintainability','readability','best-practices'].includes(x.category) ? x.category : 'maintainability',
            message: String(x.message || '问题'),
            suggestion: String(x.suggestion || ''),
            code: String(x.code || ''),
            context: Array.isArray(x.context) ? x.context.map(String) : []
          }));
        }
      }
    } catch {}
    return [{
      line: 1,
      type: 'info',
      category: 'readability',
      message: 'AI返回非结构化内容，已记录文本',
      suggestion: '调整提示词以返回JSON结构',
      code: code.split('\n')[0] || '',
      context: (code.split('\n').slice(0,3))
    }];
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setModel(model: AIModel): void {
    this.model = model;
  }

  getCurrentModel(): AIModel | null {
    return this.model;
  }

  // 测试API连接
  async testConnection(): Promise<boolean> {
    if (!this.apiKey || !this.model) {
      return false;
    }

    try {
      // 模拟API测试
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      console.error('API连接测试失败:', error);
      return false;
    }
  }

  // 代码审查
  async reviewCode(
    filePath: string,
    code: string,
    language: string,
    standards: string,
    log?: (phase: string, info?: string) => void
  ): Promise<CodeReview> {
    if (!this.apiKey || !this.model) {
      throw new Error('请先设置API密钥和选择模型');
    }

    console.log(`开始审查文件: ${filePath}`);
    if (log) log('AI请求构建', `${this.model.name} · 基于规范执行`);
    const start = performance.now();
    const modelId = this.model.id;
    const cfg = this.getProviderConfig(modelId);
    const maskedCode = this.maskSensitive(code);
    const prompt = this.buildPrompt(filePath, maskedCode, language, standards);
    const paramsPreview = { model: this.model.id, max_tokens: Math.min(this.model.maxTokens, 4096) };
    if (log) log('参数校验', JSON.stringify(paramsPreview));
    await this.enforceRateLimit(modelId);
    if (log) log('频率限制', `累计: ${(this.requestCountByModel[modelId] || 0)} 次`);

    try {
      let responseText = '';
      if (!cfg) throw new Error('未配置的模型提供方');

      // 提示（去重）：多数大模型供应商不支持浏览器直接跨域调用
      if (cfg.corsSupported === false && !this.warnedProviders.has(modelId)) {
        this.warnedProviders.add(modelId);
        if (log) log('提示', '该供应商可能不支持浏览器直连，建议使用服务器代理');
      }

      if (cfg.type === 'openai' || cfg.type === 'deepseek' || cfg.type === 'moonshot' || cfg.type === 'doubao') {
        const body = {
          model: this.model.id,
          messages: [
            { role: 'system', content: '你是资深代码审查专家。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          max_tokens: 2048
        };
        const doDirect = async () => {
          let lastErr: any = null;
          for (const url of cfg.urls) {
            try {
              if (log) log('AI请求发送', JSON.stringify({ url, body: { ...body, messages: [{ role: 'system' }, { role: 'user', content: '<已省略>' }] } }));
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  [cfg.headerAuth]: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body)
              });
              if (!res.ok) {
                const text = await res.text();
                if (log) log('AI请求失败', `status ${res.status} · ${text.slice(0,200)}`);
                lastErr = new Error(`HTTP ${res.status}`);
                continue;
              }
              const json = await res.json();
              return json?.choices?.[0]?.message?.content || json?.data || JSON.stringify(json);
            } catch (e) {
              lastErr = e;
              if (log) log('AI请求异常', (e as Error).message);
              continue;
            }
          }
          if (lastErr) throw lastErr;
          return '';
        };

        const doProxy = async () => {
          if (!this.proxyUrl) throw new Error('未配置代理地址');
          const proxyEndpoint = `${this.proxyUrl.replace(/\/$/, '')}/v1/chat/completions`;
          const proxyBody: any = { ...body, api_key: this.apiKey };
          if (log) log('代理请求发送', proxyEndpoint);
          const res = await fetch(proxyEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyBody)
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`代理HTTP ${res.status} · ${text.slice(0,200)}`);
          }
          const json = await res.json();
          return json?.choices?.[0]?.message?.content || json?.data || JSON.stringify(json);
        };

        if (this.connectionMode === 'direct') {
          responseText = await doDirect();
        } else if (this.connectionMode === 'proxy') {
          responseText = await doProxy();
        } else {
          try {
            responseText = await doDirect();
          } catch (e) {
            if (this.proxyUrl) {
              if (log) log('自动切换到代理', (e as Error).message);
              responseText = await doProxy();
            } else {
              throw e;
            }
          }
        }
      } else if (cfg.type === 'anthropic') {
        const body = {
          model: this.model.id,
          max_tokens: 2048,
          messages: [
            { role: 'user', content: prompt }
          ]
        };
        const url = cfg.urls[0];
        if (log) log('AI请求发送', JSON.stringify({ url, body: { ...body, messages: [{ role: 'user', content: '<已省略>' }] } }));
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [cfg.headerAuth]: this.apiKey
          },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        responseText = json?.content?.[0]?.text || JSON.stringify(json);
      }

      const duration = Math.round(performance.now() - start);
      if (log) log('AI响应接收', `耗时 ${duration}ms`);
      if (log) log('响应内容', responseText.slice(0, 1000));

      const issues = this.normalizeIssuesFromText(responseText, filePath, code);
      this.stats.success++;
      const summary = `审查完成，发现${issues.length}个问题`;
      if (log) log('AI结果生成', summary);
      return { file: filePath, issues, summary };
    } catch (err) {
      if (log) log('AI请求失败', (err as Error).message);
      this.stats.fail++;
      this.stats.lastError = (err as Error).message;
      const failIssue: CodeIssue = {
        line: 1,
        type: 'error',
        category: 'maintainability',
        message: 'AI调用失败，使用基础检查替代',
        suggestion: '检查API密钥、CORS或网络；或稍后重试',
        code: code.split('\n')[0] || '',
        context: code.split('\n').slice(0,3)
      };
      const summary = 'AI调用失败，返回降级结果';
      return { file: filePath, issues: [failIssue], summary };
    }
  }

  // 批量审查
  async reviewMultipleFiles(
    files: Array<{path: string, content: string, language: string}>,
    standards: string
  ): Promise<CodeReview[]> {
    const results: CodeReview[] = [];
    
    for (const file of files) {
      try {
        const review = await this.reviewCode(file.path, file.content, file.language, standards);
        results.push(review);
      } catch (error) {
        console.error(`审查文件失败: ${file.path}`, error);
        results.push({
          file: file.path,
          issues: [],
          summary: '审查失败: ' + (error as Error).message
        });
      }
    }
    
    return results;
  }
}

export default AIService;