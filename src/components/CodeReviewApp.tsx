import React, { useState, useEffect } from 'react';
import { GitBranch, Key, Upload, Play, Download, Eye, Settings, FileText, Github } from 'lucide-react';
import GitService, { GitRepository } from '../services/gitService';
import AIService, { AIModel } from '../services/aiService';
import StandardsService, { UploadedFile } from '../services/standardsService';
import ReviewService, { ReviewResult, ReviewProgress } from '../services/reviewService';
import ExportService from '../services/exportService';
import LogPanel, { LogEntry } from './LogPanel';
import ReviewResults from './ReviewResults';

const CodeReviewApp: React.FC = () => {
  // 状态管理
  const [gitUrl, setGitUrl] = useState('https://github.com/stonebirds/TagTextView.git');
  const [repository, setRepository] = useState<GitRepository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [localPath, setLocalPath] = useState('./temp_repos');

  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [connectionMode, setConnectionMode] = useState<'auto' | 'direct' | 'proxy'>('auto');
  const [proxyUrl, setProxyUrl] = useState('');

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [standardsContent, setStandardsContent] = useState('');
  const [useSampleStandards, setUseSampleStandards] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress>({
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    status: 'idle'
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'input' | 'results' | 'logs'>('input');

  // 服务实例
  const gitService = GitService.getInstance();
  const aiService = AIService.getInstance();
  const standardsService = StandardsService.getInstance();
  const reviewService = ReviewService.getInstance();
  const exportService = ExportService.getInstance();

  // 初始化
  useEffect(() => {
    // 获取AI模型列表
    const models = aiService.getAvailableModels();
    setAiModels(models);

    // 注册进度回调
    reviewService.onProgress((progress) => {
      setReviewProgress(progress);
      
      // 记录日志
      let logMessage = '';
      let logLevel: LogEntry['level'] = 'info';
      
      switch (progress.status) {
        case 'cloning':
          logMessage = progress.currentFile || '正在克隆仓库...';
          break;
        case 'analyzing':
          logMessage = `正在分析: ${progress.currentFile} (${progress.processedFiles}/${progress.totalFiles})`;
          break;
        case 'completed':
          logMessage = '代码审查完成！';
          logLevel = 'info';
          addLog('审查完成，即将跳转到审查结果', 'info');
          setTimeout(() => setActiveTab('results'), 1000);
          break;
        case 'error':
          logMessage = `错误: ${progress.error}`;
          logLevel = 'error';
          break;
        default:
          logMessage = '准备开始...';
      }
      
      addLog(logMessage, logLevel);
    });

    reviewService.onLog((level, message, details) => {
      addLog(message, level, details);
    });

    // 默认连接模式
    aiService.setConnectionMode(connectionMode);
    aiService.setProxyUrl(proxyUrl);
  }, []);

  // 添加日志
  const addLog = (message: string, level: LogEntry['level'] = 'info', details?: string) => {
    const newLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      level,
      message,
      details
    };
    setLogs(prev => [...prev, newLog]);
  };

  // 获取分支列表
  const fetchBranches = async () => {
    if (!gitUrl) {
      alert('请输入Git仓库地址');
      return;
    }

    if (!gitService.validateGitUrl(gitUrl)) {
      alert('请输入有效的Git仓库地址');
      return;
    }

    setIsLoadingBranches(true);
    addLog('正在获取分支列表...', 'info');

    try {
      const repo = await gitService.getRepositoryInfo(gitUrl);
      setRepository(repo);
      setSelectedBranch(repo.branches[0]?.name || '');
      addLog(`成功获取${repo.branches.length}个分支`, 'info');
    } catch (error) {
      addLog(`获取分支失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      alert('获取分支失败，请检查仓库地址是否正确');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  // 测试API连接
  const testConnection = async () => {
    if (!selectedModel) {
      alert('请选择AI模型');
      return;
    }

    if (!apiKey) {
      alert('请输入API密钥');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    addLog('正在测试API连接...', 'info');

    try {
      aiService.setApiKey(apiKey);
      aiService.setModel(selectedModel);
      
      const success = await aiService.testConnection();
      
      if (success) {
        setConnectionStatus('success');
        addLog('API连接测试成功', 'info');
      } else {
        setConnectionStatus('failed');
        addLog('API连接测试失败', 'error');
      }
    } catch (error) {
      setConnectionStatus('failed');
      addLog(`API连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // 上传文件
  const handleFileUpload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      try {
        const uploaded = await standardsService.uploadFile(file, (percent) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: percent }));
        });
        setUploadedFiles(prev => [uploaded, ...prev]);
        if (!standardsContent && (uploaded.parsedText || uploaded.content)) {
          setStandardsContent(uploaded.parsedText || uploaded.content);
        }
        setUseSampleStandards(false);
        addLog(`成功上传文件: ${uploaded.name}`, 'info');
      } catch (error) {
        addLog(`文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        alert(`文件上传失败: ${file.name}`);
      } finally {
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }
    }
  };

  const onInputFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await handleFileUpload(files);
    }
  };

  const onDropFiles = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) {
      await handleFileUpload(dt.files);
    }
  };

  // 使用示例规范
  const loadSampleStandards = () => {
    const sample = standardsService.generateSampleStandards();
    setStandardsContent(sample);
    setUseSampleStandards(true);
    addLog('已加载示例开发规范', 'info');
  };

  // 开始代码审查
  const startReview = async () => {
    // 验证输入
    if (!gitUrl || !selectedBranch) {
      alert('请输入Git仓库地址并选择分支');
      return;
    }

    if (!selectedModel || !apiKey) {
      alert('请选择AI模型并输入API密钥');
      return;
    }

    if (!standardsContent) {
      alert('请上传开发规范文档或使用示例规范');
      return;
    }

    if (connectionStatus !== 'success') {
      alert('请先测试API连接');
      return;
    }

    setIsReviewing(true);
    setReviewResult(null);
    setActiveTab('logs');
    addLog('开始执行代码审查...', 'info');

    try {
      // 设置本地存储路径
      gitService.setLocalStoragePath(localPath);
      
      const result = await reviewService.executeReview(gitUrl, selectedBranch, standardsContent);
      setReviewResult(result);
      addLog(`代码审查完成！共分析了${result.summary.totalFiles}个文件，发现${result.summary.totalIssues}个问题`, 'info');
    } catch (error) {
      addLog(`代码审查失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
      alert('代码审查失败，请检查配置和网络连接');
    } finally {
      setIsReviewing(false);
    }
  };

  // 导出结果
  const exportResults = (format: 'markdown' | 'html' | 'json') => {
    if (!reviewResult) return;

    try {
      switch (format) {
        case 'markdown':
          exportService.exportToMarkdown(reviewResult);
          addLog('已导出Markdown格式报告', 'info');
          break;
        case 'html':
          exportService.exportToHTML(reviewResult);
          addLog('已导出HTML格式报告', 'info');
          break;
        case 'json':
          exportService.exportToJSON(reviewResult);
          addLog('已导出JSON格式报告', 'info');
          break;
      }
    } catch (error) {
      addLog(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  };

  // 清空日志
  const clearLogs = () => {
    setLogs([]);
    addLog('日志已清空', 'info');
  };

  // 导出日志
  const exportLogs = () => {
    const logContent = logs.map(log => 
      `[${log.timestamp.toLocaleString('zh-CN')}] [${log.level.toUpperCase()}] ${log.message}${log.details ? ' ' + log.details : ''}`
    ).join('\n');
    
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const filename = `review-logs-${new Date().toISOString().split('T')[0]}.txt`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog('日志已导出', 'info');
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F5F5] text-gray-900">
      {/* 头部 */}
      <div className="w-full sticky top-0 z-30 bg-white/10 backdrop-blur supports-[backdrop-filter]:bg-white/10 border-b border-white/10">
        <div className="max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <Github className="w-8 h-8 text-white/90" />
              <h1 className="text-2xl font-bold text-white/90">AI代码审查工具</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveTab('input')}
                className={`px-4 py-2 rounded-md text-sm font-medium tap-hover ${
                  activeTab === 'input'
                    ? 'bg-white/20 text-white shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                输入配置
              </button>
              <button
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 rounded-md text-sm font-medium tap-hover ${
                  activeTab === 'results'
                    ? 'bg-white/20 text-white shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                审查结果
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-md text-sm font-medium tap-hover ${
                  activeTab === 'logs'
                    ? 'bg-white/20 text-white shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                操作日志
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'input' && (
          <div className="space-y-8">
            {/* Git仓库配置 */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <GitBranch className="w-6 h-6 mr-2 text-blue-600" />
                Git仓库配置
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Git仓库地址
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      placeholder="https://github.com/username/repository.git"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={fetchBranches}
                      disabled={isLoadingBranches}
                      className="btn btn-fetch disabled:opacity-50"
                    >
                      {isLoadingBranches ? '获取中...' : '获取分支'}
                    </button>
                  </div>
                </div>

                {repository && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      选择分支
                    </label>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {repository.branches.map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name} {branch.protected && '(受保护)'}
                        </option>
                      ))}
                    </select>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {repository.branches.map((b) => (
                        <div key={b.name} className="glass-card p-3 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{b.name}</div>
                            <div className="text-xs text-white/70">commit {b.commit}</div>
                          </div>
                          {b.protected && (
                            <span className="badge badge-info">受保护</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    本地存储路径
                  </label>
                  <input
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="./temp_repos"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    代码将被临时存储在此路径（浏览器内存中）
                  </p>
                </div>
              </div>
            </div>

            {/* AI模型配置 */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <Key className="w-6 h-6 mr-2 text-green-600" />
                AI模型配置
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择AI模型
                  </label>
                  <select
                    value={selectedModel?.id || ''}
                    onChange={(e) => {
                      const model = aiModels.find(m => m.id === e.target.value) || null;
                      setSelectedModel(model);
                      setConnectionStatus('idle');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">请选择模型</option>
                    {aiModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} - {model.provider}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedModel && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API密钥
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setConnectionStatus('idle');
                        }}
                        placeholder={`输入${selectedModel.provider} API密钥`}
                        className="flex-1 px-3 py-2 border border-ui rounded-md focus:outline-none focus:ring-2 focus:ring-ui text-gray-700"
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="btn btn-mint"
                      >
                        {showApiKey ? '隐藏' : '显示'}
                      </button>
                      <button
                        onClick={testConnection}
                        disabled={isTestingConnection}
                        className="btn btn-secondary disabled:opacity-50"
                      >
                        {isTestingConnection ? '测试中...' : '测试连接'}
                      </button>
                    </div>
                    
                    {connectionStatus === 'success' && (
                      <p className="text-sm text-green-600 mt-1">✓ API连接成功</p>
                    )}
                    {connectionStatus === 'failed' && (
                      <p className="text-sm text-red-600 mt-1">✗ API连接失败，请检查密钥</p>
                    )}
                    {/* 连接模式与代理地址 */}
                    <div className="mt-4 flex space-x-2">
                      <select
                        value={connectionMode}
                        onChange={(e) => {
                          const mode = e.target.value as 'auto' | 'direct' | 'proxy';
                          setConnectionMode(mode);
                          aiService.setConnectionMode(mode);
                          addLog(`连接模式: ${mode}`, 'info');
                        }}
                        className="px-3 py-2 border border-ui rounded-md focus:outline-none focus:ring-2 focus:ring-ui text-gray-700"
                      >
                        <option value="auto">自动（先直连，失败走代理）</option>
                        <option value="direct">直连</option>
                        <option value="proxy">代理</option>
                      </select>
                      <input
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => {
                          setProxyUrl(e.target.value);
                          aiService.setProxyUrl(e.target.value);
                        }}
                        placeholder="代理地址，如 https://proxy.example.com"
                        className="flex-1 px-3 py-2 border border-ui rounded-md focus:outline-none focus:ring-2 focus:ring-ui text-gray-700"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 开发规范配置 */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <FileText className="w-6 h-6 mr-2 text-purple-600" />
                开发规范配置
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    上传开发规范文档（支持PDF、Word、Excel、Markdown、TXT、JSON）
                  </label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDropFiles}
                    className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center ${dragOver ? 'border-purple-600 bg-purple-50' : 'border-gray-300 bg-gray-50'}`}
                  >
                    <p className="text-gray-700 mb-2">拖拽文件到此处，或点击选择</p>
                    <input
                      type="file"
                      accept=".md,.txt,.json,.pdf,.doc,.docx,.xls,.xlsx"
                      multiple
                      onChange={onInputFileChange}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-2">单文件不超过50MB</p>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={loadSampleStandards}
                      className="btn btn-sample"
                    >
                      使用示例
                    </button>
                  </div>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">已上传文件</h3>
                    <div className="bg-white border rounded-lg divide-y">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="p-3 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{file.name}</div>
                            <div className="text-xs text-gray-500">{(file.size / (1024*1024)).toFixed(2)} MB · {file.uploadTime.toLocaleString('zh-CN')}</div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {uploadProgress[file.name] !== undefined && uploadProgress[file.name] < 100 && (
                              <div className="w-32 bg-gray-200 rounded-full h-2">
                                <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${uploadProgress[file.name]}%` }} />
                              </div>
                            )}
                            {file.previewUrl && (
                              <a href={file.previewUrl} target="_blank" rel="noreferrer" className="px-3 py-1 text-sm bg-blue-600 text-white rounded">预览</a>
                            )}
                            {(file.parsedText || file.content) && (
                              <button
                                onClick={() => setStandardsContent(file.parsedText || file.content)}
                                className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                              >设为审查规范</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(uploadedFiles.length > 0 || useSampleStandards) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      规范内容预览
                    </label>
                    <textarea
                      value={standardsContent}
                      onChange={(e) => setStandardsContent(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                      placeholder="开发规范内容"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 开始审查 */}
            <div className="glass-card p-6">
              <button
                onClick={startReview}
                disabled={isReviewing}
                className="w-full flex items-center justify-center px-6 py-3 btn btn-review disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5 mr-2" />
                {isReviewing ? '审查中...' : '开始代码审查'}
              </button>
              
              {isReviewing && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>{reviewProgress.currentFile}</span>
                    <span>{reviewProgress.processedFiles}/{reviewProgress.totalFiles}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: reviewProgress.totalFiles > 0 
                          ? `${(reviewProgress.processedFiles / reviewProgress.totalFiles) * 100}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-6">
            {reviewResult ? (
              <>
                {/* 导出选项 */}
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center">
                      <Eye className="w-6 h-6 mr-2 text-blue-600" />
                      审查结果
                    </h2>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => exportResults('markdown')}
                        className="btn btn-export"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        导出Markdown
                      </button>
                      <button
                        onClick={() => exportResults('html')}
                        className="btn btn-export"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        导出HTML
                      </button>
                      <button
                        onClick={() => exportResults('json')}
                        className="btn btn-export"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        导出JSON
                      </button>
                    </div>
                  </div>
                </div>
                
                <ReviewResults 
                  reviews={reviewResult.reviews} 
                  summary={reviewResult.summary} 
                />
              </>
            ) : (
              <div className="glass-card p-8 text-center">
                <div className="text-gray-500">
                  <Eye className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">暂无审查结果</h3>
                  <p>请先完成代码审查配置并开始审查</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>{reviewProgress.currentFile}</span>
                <span>{reviewProgress.processedFiles}/{reviewProgress.totalFiles}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: reviewProgress.totalFiles > 0 
                      ? `${(reviewProgress.processedFiles / reviewProgress.totalFiles) * 100}%` 
                      : '0%'
                  }}
                />
              </div>
            </div>
            <LogPanel 
              logs={logs}
              onClear={clearLogs}
              onExport={exportLogs}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeReviewApp;