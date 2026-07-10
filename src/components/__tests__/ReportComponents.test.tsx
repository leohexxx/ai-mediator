import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportSummary from '../ReportSummary'
import CharacterMap from '../CharacterMap'
import Timeline from '../Timeline'
import VerdictCard from '../VerdictCard'
import AdviceCard from '../AdviceCard'
import type { Analysis } from '../../types'

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: 'analysis-1',
    caseId: 'case-1',
    summary: '这是一起关于房租押金退还的纠纷',
    relationship: '房东与租客',
    characters: [
      {
        name: '李房东',
        role: 'party_a',
        personality: '严谨而计较',
        stance: '要求扣除清洁费和维修费',
        emotionalState: '不满',
      },
      {
        name: '王租客',
        role: 'party_b',
        personality: '温和但坚持',
        stance: '要求全额退还押金',
        emotionalState: '委屈',
      },
    ],
    timeline: [
      {
        timestamp: '2024-03-01',
        speaker: '王租客',
        content: '我按时交了房租，房子保持得很好',
        emotion: '冷静',
        significance: '租客陈述事实',
      },
      {
        timestamp: '2024-03-05',
        speaker: '李房东',
        content: '墙上有污渍，需要重新粉刷',
        emotion: '不满',
        significance: '房东提出异议',
      },
    ],
    conflicts: [
      {
        topic: '押金退还',
        partyAStance: '扣除500元维修费',
        partyBStance: '全额退还2000元押金',
        aiJudgment: '双方各退一步',
        winner: 'tie',
      },
    ],
    verdict: {
      summary: '建议房东退还大部分押金，租客承担合理的清洁费',
      scoreA: 65,
      scoreB: 80,
      reasoning: [
        '租客提供了入住和退房时的照片作为证据',
        '房东未能提供专业的维修报价单',
        '墙面污渍属于正常使用痕迹',
      ],
      overallWinner: 'b',
    },
    advice: {
      toA: [
        '建议房东接受合理的清洁费抵扣',
        '未来应在租约中明确列出清洁标准',
      ],
      toB: [
        '建议租客提供更完整的证据链',
        '可考虑支付一定的清洁费用以达成和解',
      ],
      toBoth: [
        '双方可以协商一个折中的金额',
        '建议签订更详细的租赁合同以避免未来纠纷',
      ],
    },
    createdAt: '2024-03-10T08:00:00.000Z',
    ...overrides,
  }
}

describe('ReportSummary', () => {
  it('should render summary text', () => {
    const analysis = makeAnalysis()
    render(<ReportSummary analysis={analysis} />)

    expect(screen.getByText('这是一起关于房租押金退还的纠纷')).toBeInTheDocument()
  })

  it('should render relationship badge', () => {
    const analysis = makeAnalysis()
    render(<ReportSummary analysis={analysis} />)

    expect(screen.getByText('房东与租客')).toBeInTheDocument()
  })

  it('should render different relationship badge', () => {
    const analysis = makeAnalysis({ relationship: '同事关系' })
    render(<ReportSummary analysis={analysis} />)

    expect(screen.getByText('同事关系')).toBeInTheDocument()
  })
})

describe('CharacterMap', () => {
  it('should render all characters with names', () => {
    const analysis = makeAnalysis()
    render(<CharacterMap characters={analysis.characters} />)

    expect(screen.getByText('李房东')).toBeInTheDocument()
    expect(screen.getByText('王租客')).toBeInTheDocument()
  })

  it('should render role badges', () => {
    const analysis = makeAnalysis()
    render(<CharacterMap characters={analysis.characters} />)

    expect(screen.getByText('甲方')).toBeInTheDocument()
    expect(screen.getByText('乙方')).toBeInTheDocument()
  })

  it('should render personality descriptions', () => {
    const analysis = makeAnalysis()
    render(<CharacterMap characters={analysis.characters} />)

    expect(screen.getByText('严谨而计较')).toBeInTheDocument()
    expect(screen.getByText('温和但坚持')).toBeInTheDocument()
  })

  it('should render stance and emotional state', () => {
    const analysis = makeAnalysis()
    render(<CharacterMap characters={analysis.characters} />)

    expect(screen.getByText('立场：要求扣除清洁费和维修费')).toBeInTheDocument()
    expect(screen.getByText('立场：要求全额退还押金')).toBeInTheDocument()
    expect(screen.getByText('情绪：不满')).toBeInTheDocument()
    expect(screen.getByText('情绪：委屈')).toBeInTheDocument()
  })

  it('should render "其他" badge for other roles', () => {
    const characters = [
      {
        name: '中介小刘',
        role: 'other' as const,
        personality: '热心调解',
        stance: '中立',
        emotionalState: '平静',
      },
    ]
    render(<CharacterMap characters={characters} />)

    expect(screen.getByText('其他')).toBeInTheDocument()
    expect(screen.getByText('中介小刘')).toBeInTheDocument()
    expect(screen.getByText('热心调解')).toBeInTheDocument()
  })
})

describe('Timeline', () => {
  it('should render all events with speaker names', () => {
    const analysis = makeAnalysis()
    render(<Timeline events={analysis.timeline} />)

    expect(screen.getByText('王租客')).toBeInTheDocument()
    expect(screen.getByText('李房东')).toBeInTheDocument()
  })

  it('should render event content', () => {
    const analysis = makeAnalysis()
    render(<Timeline events={analysis.timeline} />)

    expect(screen.getByText('我按时交了房租，房子保持得很好')).toBeInTheDocument()
    expect(screen.getByText('墙上有污渍，需要重新粉刷')).toBeInTheDocument()
  })

  it('should render emotion badges', () => {
    const analysis = makeAnalysis()
    render(<Timeline events={analysis.timeline} />)

    // Emotions appear as badge spans
    expect(screen.getByText('冷静')).toBeInTheDocument()
    expect(screen.getByText('不满')).toBeInTheDocument()
  })

  it('should render timestamps', () => {
    const analysis = makeAnalysis()
    render(<Timeline events={analysis.timeline} />)

    expect(screen.getByText('2024-03-01')).toBeInTheDocument()
    expect(screen.getByText('2024-03-05')).toBeInTheDocument()
  })

  it('should render significance text', () => {
    const analysis = makeAnalysis()
    render(<Timeline events={analysis.timeline} />)

    expect(screen.getByText('租客陈述事实')).toBeInTheDocument()
    expect(screen.getByText('房东提出异议')).toBeInTheDocument()
  })

  it('should handle empty events array', () => {
    render(<Timeline events={[]} />)

    expect(screen.getByText('⏱️ 关键时间线')).toBeInTheDocument()
  })
})

describe('VerdictCard', () => {
  it('should show scores for both parties', () => {
    const analysis = makeAnalysis()
    render(<VerdictCard verdict={analysis.verdict} />)

    expect(screen.getByText('65')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('甲方合理度')).toBeInTheDocument()
    expect(screen.getByText('乙方合理度')).toBeInTheDocument()
  })

  it('should show "甲方更有理" when overallWinner is a', () => {
    const verdict = makeAnalysis().verdict
    render(<VerdictCard verdict={{ ...verdict, overallWinner: 'a' }} />)

    expect(screen.getByText(/甲方更有理/)).toBeInTheDocument()
  })

  it('should show "乙方更有理" when overallWinner is b', () => {
    const verdict = makeAnalysis().verdict
    render(<VerdictCard verdict={{ ...verdict, overallWinner: 'b' }} />)

    expect(screen.getByText(/乙方更有理/)).toBeInTheDocument()
  })

  it('should show "双方各有道理" when tie', () => {
    const verdict = makeAnalysis().verdict
    render(<VerdictCard verdict={{ ...verdict, overallWinner: 'tie' }} />)

    expect(screen.getByText('双方各有道理，难分高下')).toBeInTheDocument()
  })

  it('should show summary text', () => {
    const analysis = makeAnalysis()
    render(<VerdictCard verdict={analysis.verdict} />)

    expect(
      screen.getByText('建议房东退还大部分押金，租客承担合理的清洁费')
    ).toBeInTheDocument()
  })

  it('should show reasoning points', () => {
    const analysis = makeAnalysis()
    render(<VerdictCard verdict={analysis.verdict} />)

    expect(
      screen.getByText('租客提供了入住和退房时的照片作为证据')
    ).toBeInTheDocument()
    expect(
      screen.getByText('房东未能提供专业的维修报价单')
    ).toBeInTheDocument()
    expect(
      screen.getByText('墙面污渍属于正常使用痕迹')
    ).toBeInTheDocument()
  })

  it('should not show scores section when tie', () => {
    const verdict = makeAnalysis().verdict
    render(<VerdictCard verdict={{ ...verdict, overallWinner: 'tie' }} />)

    // When tie, the score display section is not rendered
    expect(screen.queryByText('甲方合理度')).not.toBeInTheDocument()
    expect(screen.queryByText('乙方合理度')).not.toBeInTheDocument()
  })
})

describe('AdviceCard', () => {
  it('should render advice for party A', () => {
    const analysis = makeAnalysis()
    render(
      <AdviceCard
        advice={analysis.advice}
        partyNames={{ a: '李房东', b: '王租客' }}
      />
    )

    expect(screen.getByText('给 李房东 的建议：')).toBeInTheDocument()
    expect(
      screen.getByText('建议房东接受合理的清洁费抵扣')
    ).toBeInTheDocument()
    expect(
      screen.getByText('未来应在租约中明确列出清洁标准')
    ).toBeInTheDocument()
  })

  it('should render advice for party B', () => {
    const analysis = makeAnalysis()
    render(
      <AdviceCard
        advice={analysis.advice}
        partyNames={{ a: '李房东', b: '王租客' }}
      />
    )

    expect(screen.getByText('给 王租客 的建议：')).toBeInTheDocument()
    expect(
      screen.getByText('建议租客提供更完整的证据链')
    ).toBeInTheDocument()
    expect(
      screen.getByText('可考虑支付一定的清洁费用以达成和解')
    ).toBeInTheDocument()
  })

  it('should render advice for both parties', () => {
    const analysis = makeAnalysis()
    render(
      <AdviceCard
        advice={analysis.advice}
        partyNames={{ a: '李房东', b: '王租客' }}
      />
    )

    expect(screen.getByText('双方的共同建议：')).toBeInTheDocument()
    expect(
      screen.getByText('双方可以协商一个折中的金额')
    ).toBeInTheDocument()
    expect(
      screen.getByText('建议签订更详细的租赁合同以避免未来纠纷')
    ).toBeInTheDocument()
  })

  it('should handle different party names', () => {
    const advice = {
      toA: ['建议A'],
      toB: ['建议B'],
      toBoth: ['共同建议'],
    }
    render(
      <AdviceCard
        advice={advice}
        partyNames={{ a: '张三', b: '李四' }}
      />
    )

    expect(screen.getByText('给 张三 的建议：')).toBeInTheDocument()
    expect(screen.getByText('给 李四 的建议：')).toBeInTheDocument()
  })
})
