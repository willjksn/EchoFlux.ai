import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resourceId } = req.query;

  if (!resourceId || typeof resourceId !== 'string') {
    return res.status(400).json({ error: 'Resource ID is required' });
  }

  try {
    switch (resourceId) {
      case 'content-calendar': {
        // Generate a CSV file that works as Excel
        const csvContent = `Date,Day,Platform,Content Type,Theme,Caption Ideas,Hashtags,Post Time,Engagement Notes
${new Date().toISOString().split('T')[0]},Monday,Instagram,Photo,Behind the Scenes,1-2 caption ideas here,#hashtag1 #hashtag2,9:00 AM,
,Instagram,Reel,Educational,3-5 caption ideas here,#hashtag1 #hashtag2,2:00 PM,
,TikTok,Video,Entertainment,1-2 caption ideas here,#hashtag1 #hashtag2,6:00 PM,
,Twitter,Text,Thought Leadership,1-2 caption ideas here,#hashtag1 #hashtag2,11:00 AM,
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="content-calendar-template.csv"');
        return res.send(csvContent);
      }

      case 'caption-templates': {
        // Generate a simple text/CSV file with caption templates
        const csvContent = `Category,Template,Caption,Use Case
Inspirational,Template 1,"You are capable of amazing things. Believe in yourself. 💪","Motivational posts
Personal Growth,"Template 2","Growth happens outside your comfort zone. Today, I'm choosing to...","Personal development
Behind the Scenes,"Template 3","Ever wonder what goes into [your work/process]? Here's a sneak peek...","BTS content
Product Showcase,"Template 4","Just launched [product/service] and I'm so excited! Here's why...","Product launches
Question,"Template 5","What's one thing that always makes you smile? Let me know in the comments! 👇","Engagement posts
Storytelling,"Template 6","Three years ago, I [relevant story]. Today, I'm [current situation]...","Personal stories
Educational,"Template 7","Here's how to [action] in 3 simple steps: 1. [step] 2. [step] 3. [step]","How-to content
Humor,"Template 8","Me: [funny situation] Also me: [funny reaction] 😂","Light-hearted content
Call to Action,"Template 9","Ready to [action]? Click the link in my bio to get started! 🔗","Promotional
Thank You,"Template 10","Thank you to everyone who [action]! Your support means the world. ❤️","Gratitude posts
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="caption-templates-library.csv"');
        return res.send(csvContent);
      }

      case 'engagement-scripts': {
        const csvContent = `Scenario,Response Script,Tone,Use When
Thanking for Comment,"Thank you so much! That really means a lot to me. ❤️","Warm and friendly","Responding to positive comments
Answering Questions,"Great question! [Answer]. Hope that helps! Let me know if you have more questions. 😊","Helpful and approachable","Answering audience questions
Handling Criticism,"I appreciate your perspective. I'll definitely take that into consideration. Thanks for sharing!","Professional and open","Handling constructive criticism
Promoting Engagement,"Love hearing from you! What are your thoughts on [topic]?","Conversational","Encouraging discussion
Thanking for Share,"Thank you for sharing! It means so much that you'd share my content with your audience. 🙏","Grateful","Someone shares your content
Collaboration Request,"I'd love to collaborate! Send me a DM and let's chat about how we can work together. 💼","Professional and enthusiastic","Potential collaboration
Responding to Compliment,"You're so kind! Comments like this make my day. Thank you! ✨","Appreciative","Receiving compliments
Following Up,"Hey! I saw you [action]. How did it go? Would love to hear about it!","Friendly and interested","Following up on previous conversations
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="engagement-scripts.csv"');
        return res.send(csvContent);
      }

      case 'content-strategy-guide': {
        const csvContent = `Section,Title,Content,Action Items
1,Define Your Goals,"What do you want to achieve with your content?
- Brand awareness
- Lead generation
- Community building
- Sales/Revenue
- Personal brand","[ ] Write down 3 main goals
[ ] Set measurable KPIs
[ ] Define your timeline"
2,Know Your Audience,"Who are you creating content for?
- Demographics (age, location, interests)
- Pain points and challenges
- Content preferences
- Online behavior","[ ] Create audience personas
[ ] Identify top 3 pain points
[ ] Research where they hang out online"
3,Content Pillars,"Choose 3-5 main topics you'll consistently cover:
- Educational
- Entertainment
- Inspiration
- Behind the Scenes
- User Generated Content","[ ] Select 3-5 content pillars
[ ] Brainstorm 10 ideas per pillar
[ ] Create a content mix plan"
4,Content Calendar,"Plan your content:
- Posting frequency (daily, 3x/week, etc.)
- Best times for your audience
- Content mix across platforms
- Theme days (e.g., Monday Motivation)","[ ] Set posting schedule
[ ] Use a calendar tool
[ ] Batch create content
[ ] Schedule in advance"
5,Analytics & Optimization,"Track what works:
- Engagement rates
- Best performing content types
- Optimal posting times
- Audience growth
- Click-through rates","[ ] Set up analytics tracking
[ ] Review weekly metrics
[ ] Adjust strategy based on data
[ ] Double down on what works"
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="content-strategy-playbook.csv"');
        return res.send(csvContent);
      }

      case 'hashtag-research': {
        const csvContent = `Hashtag,Category,Posts (Approx),Engagement Level,Relevance Score (1-10),Notes,Use Status
#yourniche,Industry Specific,500K,Medium,9,Very relevant to my brand,Active
#nichespecific,Industry Specific,200K,High,10,Perfect match,Active
#trendingnow,General,2M,Low,4,Too broad,Inactive
#creator,Community,1M,Medium,7,Good for visibility,Active
#entrepreneur,Community,3M,Low,6,Competitive,Maybe
#smallbusiness,Business,800K,Medium,8,Good for B2B,Active
#motivation,General,5M,Low,3,Too generic,Inactive
#growthmindset,Personal Development,400K,High,9,Aligned with values,Active
#hustle,Entrepreneurship,2M,Medium,5,Overused,Inactive
#authentic,Values,300K,High,10,Perfect fit,Active
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="hashtag-research-worksheet.csv"');
        return res.send(csvContent);
      }

      case 'analytics-dashboard': {
        const csvContent = `Date,Platform,Followers,Following,Posts,Engagements,Likes,Comments,Shares,Saves,Reach,Impressions,Engagement Rate,Top Post,Notes
${new Date().toISOString().split('T')[0]},Instagram,1000,500,5,250,200,30,10,10,1500,2000,12.5%,Post Title,Great engagement this week
,Instagram,1000,500,5,220,180,25,8,7,1400,1800,11.0%,Post Title,Good performance
,Instagram,1010,500,5,280,220,35,12,13,1600,2100,13.3%,Post Title,Best performing post
,TikTok,500,200,3,150,120,20,10,0,2000,2500,6.0%,Video Title,Growing well
,Twitter,800,600,10,100,80,15,5,0,500,800,12.5%,Tweet Title,Steady growth
`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="analytics-tracker.csv"');
        return res.send(csvContent);
      }

      default:
        return res.status(404).json({ error: 'Resource not found' });
    }
  } catch (error: any) {
    console.error('Error generating resource template:', error);
    return res.status(500).json({ error: 'Failed to generate resource template' });
  }
}
