import React, { useState, useEffect } from 'react';
import { Terminal, Info, AlertTriangle, AlertCircle, XCircle, Download } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  details?: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  onExport: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, onClear, onExport }) => {
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const levels = ['all', 'info', 'warning', 'error', 'debug'];

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level === filter);

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'debug':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info':
        return 'text-blue-300 bg-white/5 border border-white/10';
      case 'warning':
        return 'text-yellow-200 bg-white/5 border border-white/10';
      case 'error':
        return 'text-red-300 bg-white/5 border border-white/10';
      case 'debug':
        return 'text-white/70 bg-white/5 border border-white/10';
      default:
        return 'text-white/70 bg-white/5 border border-white/10';
    }
  };

  const scrollToBottom = () => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs, autoScroll]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="glass-card">
      {/* 日志面板头部 */}
      <div className="flex items-center justify-between p-4 border-b border-ui">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-900">操作日志</h3>
          <span className="badge badge-neutral">
            {filteredLogs.length}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 过滤器 */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1 rounded-md text-sm bg-white border border-ui text-gray-700 focus:outline-none focus:ring-2 focus:ring-ui"
          >
            {levels.map(level => (
              <option key={level} value={level}>
                {level === 'all' ? '全部' : level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>

          {/* 自动滚动 */}
          <label className="flex items-center space-x-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <span>自动滚动</span>
          </label>

          {/* 导出按钮 */}
          <button
            onClick={onExport}
            className="btn btn-export text-sm"
          >
            <Download className="w-4 h-4" />
            <span>导出</span>
          </button>

          {/* 清空按钮 */}
          <button
            onClick={onClear}
            className="btn btn-clear text-sm"
          >
            清空
          </button>
        </div>
      </div>

      {/* 日志内容 */}
      <div className="h-80 lg:h-96 overflow-y-auto bg-white p-4 font-mono text-sm">
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无日志记录</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`flex items-start space-x-2 p-2 rounded ${getLogColor(log.level)} tap-hover`}>
                <div className="flex-shrink-0 mt-0.5">
                  {getLogIcon(log.level)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-600 text-xs">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className="font-medium capitalize text-xs">
                      {log.level}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900">{log.message}</div>
                  {log.details && (
                    <div className="text-xs text-gray-700 mt-1 ml-4">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LogPanel;