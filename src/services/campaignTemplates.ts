// src/services/campaignTemplates.ts
// Pre-built campaign templates for quick launch

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  goal: string;
  niche?: string;
  audience?: string;
  icon: string;
  category: 'business' | 'creator' | 'both';
  durationWeeks?: number;
  suggestedTone?: string;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'product-launch',
    name: 'Product Launch Campaign',
    description: 'Build anticipation and drive sales for your new product launch',
    goal: 'Launch our new product and drive sales through engaging content that showcases features, benefits, and customer testimonials',
    category: 'business',
    icon: '🚀',
    durationWeeks: 4,
    suggestedTone: 'Exciting',
  },
  {
    id: 'follower-growth',
    name: 'Follower Growth Sprint',
    description: 'Fast-track your follower growth with engaging, value-driven content',
    goal: 'Grow our follower base rapidly by sharing high-value content that resonates with our target audience and encourages sharing',
    category: 'creator',
    icon: '📈',
    durationWeeks: 4,
    suggestedTone: 'Engaging',
  },
  {
    id: 'engagement-boost',
    name: 'Engagement Boost',
    description: 'Increase likes, comments, and shares with interactive, community-focused content',
    goal: 'Significantly boost engagement rates by creating interactive content, asking questions, and fostering community discussions',
    category: 'both',
    icon: '💬',
    durationWeeks: 3,
    suggestedTone: 'Interactive',
  },
  {
    id: 'seasonal-content',
    name: 'Seasonal Content Campaign',
    description: 'Celebrate holidays and seasons with themed, timely content',
    goal: 'Create seasonal content that connects with our audience during holidays and special occasions, building brand affinity',
    category: 'both',
    icon: '🎄',
    durationWeeks: 4,
    suggestedTone: 'Festive',
  },
  {
    id: 'brand-awareness',
    name: 'Brand Awareness Campaign',
    description: 'Increase visibility and recognition with consistent brand messaging',
    goal: 'Increase brand awareness and recognition by consistently sharing our brand story, values, and mission across all platforms',
    category: 'business',
    icon: '🎯',
    durationWeeks: 6,
    suggestedTone: 'Professional',
  },
  {
    id: 'content-series',
    name: 'Educational Content Series',
    description: 'Establish expertise with a focused series of educational posts',
    goal: 'Establish ourselves as thought leaders by creating a series of educational content that provides value to our audience',
    category: 'both',
    icon: '📚',
    durationWeeks: 4,
    suggestedTone: 'Informative',
  },
  {
    id: 'behind-scenes',
    name: 'Behind the Scenes',
    description: 'Humanize your brand with authentic behind-the-scenes content',
    goal: 'Build deeper connections with our audience by sharing authentic behind-the-scenes content that shows the human side of our brand',
    category: 'both',
    icon: '🎬',
    durationWeeks: 2,
    suggestedTone: 'Authentic',
  },
  {
    id: 'customer-success',
    name: 'Customer Success Stories',
    description: 'Build trust and credibility with real customer testimonials and case studies',
    goal: 'Build trust and credibility by showcasing customer success stories, testimonials, and case studies',
    category: 'business',
    icon: '⭐',
    durationWeeks: 4,
    suggestedTone: 'Trustworthy',
  },
];

export function getTemplatesForUserType(userType: 'Creator' | 'Business'): CampaignTemplate[] {
  return CAMPAIGN_TEMPLATES.filter(
    template => template.category === 'both' || template.category === userType.toLowerCase()
  );
}

export function getTemplateById(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find(template => template.id === id);
}

