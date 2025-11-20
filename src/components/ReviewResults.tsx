import React, { useMemo } from 'react';
import { CodeReview, CodeIssue } from '../services/aiService';
import { ReviewSummary } from '../services/reviewService';
import { FileText, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface ReviewResultsProps {
  reviews: CodeReview[];
  summary: ReviewSummary;
}

const ReviewResults: React.FC<ReviewResultsProps> = ({ reviews, summary }) => {
  // HTML转义函数，防止特殊字符导致显示问题
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // 安全地渲染代码行，处理特殊字符和Unicode
  const renderCodeLine = (line: string, isHighlight: boolean = false) => {
    const escapedLine = escapeHtml(line);
    if (isHighlight) {
      return <span className="bg-yellow-600 px-1" dangerouslySetInnerHTML={{ __html: escapedLine }} />;
    }
    return <span dangerouslySetInnerHTML={{ __html: escapedLine }} />;
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  const getIssueColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'card-danger';
      case 'warning':
        return 'card-warning';
      case 'info':
        return 'card-info';
      default:
        return 'card-neutral';
    }
  };

  const getCategoryBadge = (category: string) => {
    const classes = {
      'security': 'badge badge-danger',
      'performance': 'badge badge-warning',
      'maintainability': 'badge badge-info',
      'readability': 'badge badge-success',
      'best-practices': 'badge badge-neutral'
    } as const;
    return (
      <span className={classes[category as keyof typeof classes] || 'badge badge-neutral'}>
        {category}
      </span>
    );
  };

  return (
    <div className="space-y-6 fade-in">
      {/* 概览统计 */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          审查概览
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-700">{summary.totalFiles}</div>
            <div className="text-sm text-gray-500">总文件数</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{summary.totalIssues}</div>
            <div className="text-sm text-red-500">总问题数</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{summary.filesWithIssues}</div>
            <div className="text-sm text-yellow-500">问题文件数</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {summary.totalFiles - summary.filesWithIssues}
            </div>
            <div className="text-sm text-green-500">无问题文件</div>
          </div>
        </div>

        {/* 问题类型分布 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-3">按类型分布</h4>
            <div className="space-y-2">
              {Object.entries(summary.issuesByType).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="capitalize">{type}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-3">按类别分布</h4>
            <div className="space-y-2">
              {Object.entries(summary.issuesByCategory).map(([category, count]) => (
                <div key={category} className="flex justify-between items-center">
                  <span className="capitalize">{category.replace('-', ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 详细问题列表 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">详细问题</h3>
        
        {reviews.filter(review => review.issues.length > 0).map((review, reviewIndex) => (
          <div key={reviewIndex} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-blue-600">{review.file}</h4>
              <span className="text-sm text-gray-500">
                {review.issues.length} 个问题
              </span>
            </div>

            <div className="space-y-4">
              {review.issues.map((issue, issueIndex) => (
                <div key={issueIndex} className={`border rounded-lg p-4 ${getIssueColor(issue.type)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getIssueIcon(issue.type)}
                      <span className="font-medium capitalize">{issue.type}</span>
                      <span className="text-sm text-gray-500">
                        第 {issue.line} 行
                        {issue.column && `:${issue.column}`}
                      </span>
                    </div>
                    {getCategoryBadge(issue.category)}
                  </div>

                  <div className="mb-3">
                    <p className="text-gray-700 mb-2">{issue.message}</p>
                    
                    {/* 代码上下文 */}
                  <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                    {issue.context.map((line, idx) => {
                      const isHighlight = line === issue.code;
                      return (
                        <div key={idx} className="flex min-w-max">
                          <span className="w-8 text-gray-500 select-none text-right pr-2">
                            {idx + 1}
                          </span>
                          <span className="flex-1 whitespace-pre">
                            {renderCodeLine(line, isHighlight)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                      <Info className="w-4 h-4 text-blue-300 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-white mb-1">建议:</div>
                        <div className="text-white/80">{issue.suggestion}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {review.summary && (
              <div className="mt-4 p-3 bg-white/5 rounded-lg">
                <div className="text-sm text-white/70">{review.summary}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {reviews.filter(review => review.issues.length > 0).length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">太棒了！</h3>
          <p className="text-white/80">没有发现任何代码问题，代码质量很高！</p>
        </div>
      )}
    </div>
  );
};

export default ReviewResults;