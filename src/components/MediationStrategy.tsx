import type { MediationStep } from '../types';

interface Props {
  mediationStrategy: MediationStep[];
  partyNames: { a: string; b: string };
}

/**
 * 报告第三屏：调解策略步骤列表。
 * 每步显示 step 号 + title + description + target 标签 + expectedOutcome + difficulty 标签。
 */
export default function MediationStrategy({ mediationStrategy, partyNames }: Props) {
  const targetLabel = (target: string) => {
    if (target === 'a') return partyNames.a;
    if (target === 'b') return partyNames.b;
    return '双方';
  };

  const targetColor = (target: string) => {
    if (target === 'a') return 'bg-blue-900/50 text-blue-400';
    if (target === 'b') return 'bg-pink-900/50 text-pink-400';
    return 'bg-purple-900/50 text-purple-400';
  };

  const difficultyLabel = (difficulty: string) => {
    if (difficulty === 'easy') return '简单';
    if (difficulty === 'medium') return '中等';
    return '困难';
  };

  const difficultyColor = (difficulty: string) => {
    if (difficulty === 'easy') return 'bg-green-900/50 text-green-400';
    if (difficulty === 'medium') return 'bg-yellow-900/50 text-yellow-400';
    return 'bg-red-900/50 text-red-400';
  };

  if (!mediationStrategy || mediationStrategy.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm text-brand-400 font-medium mb-2">🤝 调解路线图</h3>
        <p className="text-sm text-gray-500">暂无调解策略数据</p>
      </div>
    );
  }

  return (
    <div className="card bg-gradient-to-br from-green-950/20 to-gray-900 border-green-800/30">
      <h3 className="text-sm text-green-400 font-medium mb-4">🤝 调解路线图</h3>

      <div className="space-y-4">
        {mediationStrategy.map((step) => (
          <div key={step.step} className="flex gap-3">
            {/* 步骤号 */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-8 h-8 rounded-full bg-green-900/50 border border-green-700 flex items-center justify-center text-sm font-bold text-green-400">
                {step.step}
              </div>
              {step.step < mediationStrategy.length && (
                <div className="w-px flex-1 bg-gray-800 mt-1" />
              )}
            </div>

            {/* 步骤内容 */}
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-medium text-gray-200">{step.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${targetColor(step.target)}`}>
                  {targetLabel(step.target)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${difficultyColor(step.difficulty)}`}>
                  {difficultyLabel(step.difficulty)}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-2">{step.description}</p>
              <div className="bg-gray-800/50 rounded-lg px-3 py-1.5">
                <p className="text-xs text-gray-500">
                  <span className="text-green-500">预期：</span>
                  {step.expectedOutcome}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
