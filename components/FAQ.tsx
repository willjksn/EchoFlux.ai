import React, { useState } from 'react';

const faqData = [
    {
        question: "What's the difference between Creator and Business mode?",
        answer: "Creator mode is tailored for personal brand building, focusing on metrics like follower growth and engagement. Business mode transforms the app into a marketing command center, focusing on ROI metrics like website clicks, leads, and sales. The AI tools, like the Autopilot/Marketing Manager, also adapt to offer you more relevant campaign ideas."
    },
    {
        question: "What is Quick Post Automation?",
        answer: "Quick Post Automation is our time-saving feature that lets you upload multiple images or videos at once. Simply select your platforms, set your goal and tone, and our AI will automatically analyze each piece of media, generate captions and hashtags, and schedule posts at optimal times. Perfect for busy creators and businesses who need to maintain a consistent social media presence."
    },
    {
        question: "How does the AI Content Strategist work?",
        answer: "The AI Content Strategist takes your brand niche (for Creators) or business type (for Businesses) and your goals, then generates a comprehensive multi-week content roadmap. It suggests topics, formats (Reels, Posts), platforms, and provides specific image and video ideas for each post. You can upload media directly to roadmap items, and the AI will auto-generate captions and schedule posts to your calendar. The roadmap stays on the page until you create a new one or posts are used."
    },
    {
        question: "Can I replace Linktree with EngageSuite?",
        answer: "Yes! Our 'Smart Link-in-Bio' builder allows you to create a beautiful, branded mobile landing page. It also includes a built-in Email Capture form, letting you grow your newsletter list directly from Instagram or TikTok without needing a separate website."
    },
    {
        question: "What is the Media Library?",
        answer: "The Media Library is your personal storage for images and videos. Upload media once and reuse it across multiple posts. When composing, you can select from your library instead of uploading new files each time. Media stays in your library until you delete it, making it easy to maintain a consistent brand aesthetic and save time."
    },
    {
        question: "How does the Calendar work?",
        answer: "The Calendar shows all your scheduled posts in a beautiful monthly view. Click any scheduled post to see a preview with the image/video, caption, hashtags, and scheduled date/time. You can edit the date, time, and platforms directly from the preview, or delete posts if needed. Only posts that are fully ready (with media, captions, and scheduling details) appear on the calendar."
    },
    {
        question: "Is my data safe when connecting accounts?",
        answer: "Absolutely. We use official APIs and secure OAuth authentication for all social platforms. We never see or store your passwords, and you can revoke our access at any time from your social media account settings."
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