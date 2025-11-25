

import React, { useState } from 'react';

const faqData = [
    {
        question: "What is the 'Command Center' Dashboard?",
        answer: "The Command Center is the new home screen of EngageSuite.ai. Instead of just showing a list of messages, it provides a high-level executive summary of your account. You can see your Account Health Score, upcoming posts from your calendar, a snapshot of urgent messages, and quick shortcuts to generate content or strategy. You can still toggle back to the classic 'Full Inbox' view at any time."
    },
    {
        question: "What is the Social CRM and how does it help me?",
        answer: "The Social CRM transforms your inbox from a simple message list into a relationship management tool. You can click on any user to see a sidebar where you can add internal notes (e.g., 'VIP Client', 'Complained about shipping'), apply tags (e.g., 'Lead', 'Influencer'), and view your entire history of interactions with them. This helps you provide personalized support and track leads directly from social media."
    },
    {
        question: "How does the AI Content Strategist work?",
        answer: "The Strategist takes your brand niche, target audience, and goals (e.g., Brand Awareness) and generates a comprehensive 4-week content plan. It suggests topics, formats (Reels, Posts), and themes for every day. With one click, you can 'Populate Calendar' to turn this plan into draft posts in your schedule."
    },
    {
        question: "Can I replace tools like Linktree with EngageSuite?",
        answer: "Yes! Our 'Smart Link-in-Bio' builder allows you to create a beautiful, branded mobile landing page for your social profiles. Unlike basic link tools, ours includes a built-in Email Capture form, allowing you to grow your newsletter list directly from Instagram or TikTok without needing a separate website."
    },
    {
        question: "What is Social Listening?",
        answer: "Social Listening allows you to track conversations happening *about* you, even if you aren't tagged. You can set up keywords for your brand name, competitors, or industry terms. EngageSuite will scan the web and social platforms to bring these mentions into your Analytics dashboard, helping you manage your reputation and find new customers."
    },
    {
        question: "How do the Approval Workflows work for teams?",
        answer: "For Agency and Elite plans, we offer a Kanban-style approval board. Team members can submit posts as 'Drafts' or 'In Review'. Managers can then review the content, leave internal comments for feedback, and move posts to 'Approved' or 'Scheduled'. We also offer 'External Approval Links' so you can share a read-only view with clients who don't have an account."
    },
    {
        question: "What is the 'Remix' feature?",
        answer: "The Remix engine helps you get more value out of every content idea. With one click, you can take a caption written for Instagram and have our AI rewrite it perfectly for LinkedIn (more professional) or X/Twitter (shorter and punchier), saving you hours of copywriting time."
    },
    {
        question: "How does the Competitor Analysis work?",
        answer: "You can add the social handles of your top competitors in the Analytics tab. We track their public metrics like engagement rates, follower growth, and posting frequency. We also analyze their top-performing content types and posting times to give you actionable insights on how to beat them."
    },
    {
        question: "How does AI Image and Video generation work?",
        answer: "You provide a text prompt describing what you want. For images, our AI generates unique visuals. For videos, we use the advanced Veo model to create high-quality clips. On premium plans, you can upload an 'AI Avatar' (base image) so the AI generates content featuring you or your product consistent style."
    },
    {
        question: "Can I really clone my own voice?",
        answer: "Yes! Pro, Elite, and Agency plans allow you to upload an audio sample to create a custom AI voice clone. You can then type any script, and our AI will generate a voice-over that sounds just like you for your Reels or TikToks."
    },
    {
        question: "What happens if I run out of AI credits?",
        answer: "If you exhaust your monthly plan's allowance for images or videos, you have two options: 1) Purchase a one-time 'Credit Pack' to top up your account instantly. 2) On Elite/Agency plans, use our 'Bring Your Own Key' (BYOK) feature to connect your own Google Gemini API key and pay Google directly for usage at cost."
    },
    {
        question: "Is my data safe when connecting accounts?",
        answer: "Absolutely. We use official APIs and secure OAuth authentication for all social platforms (Instagram, TikTok, LinkedIn, etc.). We never see or store your passwords. You can revoke access at any time."
    }
];

const FaqItem: React.FC<{ question: string; answer: string; }> = ({ question, answer }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-gray-200 dark:border-gray-700 py-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center text-left text-lg font-semibold text-gray-800 dark:text-gray-200"
            >
                <span>{question}</span>
                <svg
                    className={`w-6 h-6 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="mt-4 text-gray-600 dark:text-gray-400 prose dark:prose-invert">
                    <p>{answer}</p>
                </div>
            )}
        </div>
    );
};

export const FAQ: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Everything you need to know about the platform.</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                {faqData.map((faq, index) => (
                    <FaqItem key={index} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </div>
    );
};
