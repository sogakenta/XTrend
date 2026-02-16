import type { TrendItem, TrendItemWithSignals } from './types';

// Mock descriptions for demonstration
// In production, this would come from Wikidata/Wikipedia/LLM
const mockDescriptions: Record<string, { description: string; source: 'wikipedia' | 'wikidata' | 'mock' }> = {
  // Common Japanese trends (examples)
  '推しの子': { description: '赤坂アカ原作、横槍メンゴ作画による日本の漫画作品。芸能界を舞台にしたサスペンス。', source: 'wikipedia' },
  'ワンピース': { description: '尾田栄一郎による日本の漫画作品。海賊王を目指す少年ルフィの冒険を描く。', source: 'wikipedia' },
  '呪術廻戦': { description: '芥見下々による日本の漫画作品。呪いをテーマにしたダークファンタジー。', source: 'wikipedia' },
  'ポケモン': { description: '株式会社ポケモンが展開するメディアミックス作品。ゲーム、アニメ、カードゲームなど。', source: 'wikipedia' },
  'スプラトゥーン': { description: '任天堂が開発・販売するアクションシューティングゲーム。インクを塗り合うバトル。', source: 'wikipedia' },
  'FF16': { description: 'スクウェア・エニックスのRPG「ファイナルファンタジー」シリーズ第16作目。', source: 'wikipedia' },
  'ブルアカ': { description: '「ブルーアーカイブ」の略称。Yostarが運営するスマートフォン向けRPG。', source: 'mock' },
  '原神': { description: 'miHoYoが開発したオープンワールドアクションRPG。', source: 'wikipedia' },
};

// Generate random momentum signals for demo
function generateMockSignals(): Pick<TrendItemWithSignals, 'rankChange' | 'durationHours' | 'regionCount'> {
  const rankChange = Math.random() > 0.3
    ? Math.floor(Math.random() * 20) - 5  // -5 to +15
    : undefined;

  const durationHours = Math.random() > 0.2
    ? Math.floor(Math.random() * 24) + 1  // 1-24 hours
    : undefined;

  const regionCount = Math.random() > 0.4
    ? Math.floor(Math.random() * 5) + 1  // 1-5 regions
    : undefined;

  return { rankChange, durationHours, regionCount };
}

// Find description by partial match
function findDescription(termText: string): { description: string; source: 'wikipedia' | 'wikidata' | 'mock' } | undefined {
  // Exact match
  if (mockDescriptions[termText]) {
    return mockDescriptions[termText];
  }

  // Partial match (remove # prefix, etc.)
  const normalized = termText.replace(/^#/, '');
  if (mockDescriptions[normalized]) {
    return mockDescriptions[normalized];
  }

  // Check if term contains any known keyword
  for (const [key, value] of Object.entries(mockDescriptions)) {
    if (termText.includes(key) || key.includes(termText)) {
      return value;
    }
  }

  return undefined;
}

// Enhance trend items with mock signals
export function addMockSignals(trends: TrendItem[]): TrendItemWithSignals[] {
  return trends.map((trend, index) => {
    const signals = generateMockSignals();
    const descData = findDescription(trend.termText);

    // Top 10 items are more likely to have descriptions (for demo)
    const showDescription = index < 10 && (descData || Math.random() > 0.6);

    return {
      ...trend,
      ...signals,
      description: showDescription
        ? descData?.description || generateGenericDescription(trend.termText)
        : undefined,
      descriptionSource: showDescription
        ? descData?.source || 'mock'
        : undefined,
    };
  });
}

function generateGenericDescription(termText: string): string {
  // Generate a generic placeholder description
  const templates = [
    `「${termText}」に関連するトピックがトレンド入りしています。`,
    `${termText}についての話題が急上昇中。`,
    `現在${termText}が注目を集めています。`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
