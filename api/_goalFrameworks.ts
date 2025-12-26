/**
 * Goal-Specific Strategic Frameworks
 * 
 * Shared utility for providing goal-specific strategic guidance to Gemini AI
 * across all content generation endpoints.
 */

export function getGoalFramework(goal: string): string {
  switch (goal) {
    case 'Increase Followers/Fans':
      return `
STRATEGIC FRAMEWORK FOR FOLLOWER GROWTH:
- Focus on discoverability: Use trending hashtags, participate in challenges, collaborate with others
- Create shareable content: Educational tips, entertaining moments, relatable stories
- Engage with audience: Ask questions, run polls, respond to comments
- Showcase personality: Behind-the-scenes, personal stories, authentic moments
- Cross-promote: Mention other platforms, create platform-specific content
- Post consistently: Maintain regular posting schedule to stay in algorithm
- Use hooks: Start with attention-grabbing first lines, use visual storytelling
- Leverage trends: Adapt trending audio, formats, and challenges to your niche
- Build community: Create content that makes people want to follow for more
- Value-first approach: Give away valuable content that makes people want to see more
`;
    case 'Lead Generation':
      return `
STRATEGIC FRAMEWORK FOR LEAD GENERATION:
- Problem-solution content: Address pain points your audience faces
- Educational value: Share tips, guides, and insights that establish expertise
- Social proof: Case studies, testimonials, success stories
- Clear CTAs: Direct calls-to-action to download, sign up, or contact
- Lead magnets: Offer valuable resources (checklists, guides, templates)
- Build trust: Show expertise, share knowledge, demonstrate value
- Nurture sequence: Create content that guides prospects through awareness to consideration
- Platform-specific CTAs: Use platform-appropriate lead capture methods
- Value demonstration: Show what they'll get, not just what you offer
- Follow-up content: Create content that supports email sequences and follow-ups
`;
    case 'Sales Conversion':
      return `
STRATEGIC FRAMEWORK FOR SALES CONVERSION:
- Product/service showcase: Demonstrate features, benefits, and use cases
- Social proof: Customer testimonials, reviews, before/after results
- Urgency and scarcity: Limited-time offers, exclusive deals, limited availability
- Problem-agitation-solution: Identify problem, amplify pain, present solution
- Educational selling: Teach about the problem your product solves
- Behind-the-scenes: Show process, quality, craftsmanship, or service delivery
- Comparison content: Your product vs alternatives, why choose you
- Clear value proposition: What makes your offer unique and valuable
- Multiple touchpoints: Create content that works at different stages of buyer journey
- Strong CTAs: Clear, compelling calls-to-action to purchase or book
`;
    case 'Brand Awareness':
      return `
STRATEGIC FRAMEWORK FOR BRAND AWARENESS:
- Consistent brand voice: Maintain tone, style, and messaging across all content
- Visual identity: Use consistent colors, fonts, and design elements
- Brand story: Share origin story, mission, values, and what makes you unique
- Thought leadership: Share insights, opinions, and expertise in your niche
- Collaborations: Partner with other brands or creators in your space
- User-generated content: Encourage and share content from your community
- Educational content: Position brand as expert and go-to resource
- Emotional connection: Create content that resonates emotionally with audience
- Multi-platform presence: Consistent messaging across all platforms
- Memorable moments: Create shareable, memorable content that sticks
`;
    case 'Community Engagement':
    case 'Customer Engagement':
      return `
STRATEGIC FRAMEWORK FOR ENGAGEMENT:
- Interactive content: Polls, questions, quizzes, challenges that invite participation
- Respond and engage: Actively reply to comments, DMs, and mentions
- User-generated content: Feature followers, run contests, create community challenges
- Behind-the-scenes: Show real, authentic moments that build connection
- Ask for input: Let audience vote on decisions, share opinions, co-create
- Create conversations: Post discussion starters, controversial (but respectful) takes
- Share community wins: Celebrate followers, highlight community members
- Live content: Go live, host Q&As, create real-time engagement opportunities
- Story features: Use Stories for daily engagement, polls, questions
- Value-driven engagement: Give value that makes people want to engage back
`;
    case 'Increase Engagement':
      return `
STRATEGIC FRAMEWORK FOR INCREASING ENGAGEMENT:
- Hook in first 3 seconds: Capture attention immediately with visuals or text
- Ask questions: End posts with questions that invite comments
- Use trending formats: Leverage trending audio, effects, and formats
- Create debate: Share opinions that spark discussion (respectfully)
- Educational hooks: "Did you know...", "Here's why...", "The secret to..."
- Visual storytelling: Use carousels, before/after, transformation content
- Relatable moments: Share experiences your audience can relate to
- Call out specific actions: "Double tap if...", "Comment your...", "Share if..."
- Timing optimization: Post when your audience is most active
- Engagement loops: Create content that naturally encourages saves, shares, comments
`;
    default:
      return `
STRATEGIC FRAMEWORK FOR ${goal}:
- Align all content with the primary goal: ${goal}
- Create measurable outcomes: Each piece of content should contribute to the goal
- Use platform best practices: Optimize content for each platform's algorithm
- Test and iterate: Vary content types and measure what works best
- Build momentum: Create content that builds on previous posts
- Stay consistent: Maintain regular posting schedule aligned with goal
`;
  }
}

export function getGoalSpecificCTAs(goal: string): string {
  switch (goal) {
    case 'Increase Followers/Fans':
      return '- "Follow for more [value]", "Save this post", "Share with someone who needs this"';
    case 'Lead Generation':
      return '- "Download our free guide", "Sign up for tips", "Get your free [resource]"';
    case 'Sales Conversion':
      return '- "Shop now", "Limited time offer", "Book a call", "Get started today"';
    case 'Brand Awareness':
      return '- "Tag someone who needs this", "Share your thoughts", "What do you think?"';
    case 'Community Engagement':
    case 'Customer Engagement':
      return '- "Comment your experience", "Share your story", "What would you do?"';
    case 'Increase Engagement':
      return '- "Double tap if you agree", "Comment your answer", "Save for later", "Share if this resonates"';
    default:
      return '- Use clear, goal-aligned calls-to-action';
  }
}

export function getGoalSpecificContentGuidance(goal: string): string {
  switch (goal) {
    case 'Increase Followers/Fans':
      return `
- Include content that showcases expertise and personality to attract new followers
- Create shareable, viral-worthy content that expands reach
- Use trending formats and hashtags to increase discoverability
- Build curiosity and "follow for more" value propositions
`;
    case 'Lead Generation':
      return `
- Create problem-aware content that identifies pain points
- Offer valuable resources (guides, checklists, templates) as lead magnets
- Include clear CTAs directing to lead capture (download, sign up, contact)
- Build trust and authority to make people comfortable sharing contact info
`;
    case 'Sales Conversion':
      return `
- Showcase product/service benefits and use cases
- Include social proof (testimonials, reviews, case studies)
- Create urgency with limited-time offers or exclusive deals
- Address objections and show why your offer is the best choice
`;
    case 'Brand Awareness':
      return `
- Maintain consistent brand voice and visual identity
- Share brand story, mission, and what makes you unique
- Create memorable, shareable content that sticks in people's minds
- Position as thought leader and expert in your niche
`;
    case 'Community Engagement':
    case 'Customer Engagement':
      return `
- Create interactive content (polls, questions, challenges)
- Feature user-generated content and community members
- Respond actively and create two-way conversations
- Build emotional connection and sense of belonging
`;
    case 'Increase Engagement':
      return `
- Use hooks that capture attention in first 3 seconds
- Ask questions and create discussion starters
- Use trending formats and audio to maximize reach
- Create content that naturally encourages saves, shares, and comments
`;
    default:
      return `
- Align all content with the primary goal: ${goal}
- Create measurable outcomes that contribute to goal achievement
`;
  }
}


