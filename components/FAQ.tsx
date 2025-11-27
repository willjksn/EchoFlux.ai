import React, { useState } from 'react';

const faqData = [
    {
        question: "What's the difference between Creator and Business mode?",
        answer: "Creator mode is tailored for personal brand building, focusing on metrics like follower growth and engagement. Business mode transforms the app into a marketing command center, focusing on ROI metrics like website clicks, leads, and sales. The AI tools, like the Autopilot/Marketing Manager, also adapt to offer you more relevant campaign ideas."
    },
    {
        question: "What is the AI Marketing Manager for businesses?",
        answer: "This is the business version of our Autopilot. Instead of generic content ideas, it provides strategic 'Campaign Ideas' like 'Promote a Weekly Special' or 'Highlight a Customer Review'. You can select an idea or type a custom goal, and the AI will generate a complete marketing campaign—from strategy to final posts—for your approval."
    },
    {
        question: "How does the AI Content Strategist work?",
        answer: "The Strategist takes your brand niche (for Creators) or business type (for Businesses) and your goals, and generates a comprehensive multi-week content plan. It suggests topics, formats (Reels, Posts), and themes for every day. You can then 'Populate Calendar' to turn this plan into draft posts in your schedule."
    },
    {
        question: "Can I replace Linktree with EngageSuite?",
        answer: "Yes! Our 'Smart Link-in-Bio' builder allows you to create a beautiful, branded mobile landing page. It also includes a built-in Email Capture form, letting you grow your newsletter list directly from Instagram or TikTok without needing a separate website."
    },
    {
        question: "How does AI Image and Video generation work?",
        answer: "You provide a text prompt describing what you want. For images, our AI generates unique visuals. For videos, we use the advanced Veo model to create high-quality clips. On premium plans, you can upload an 'AI Avatar' (a base image) so the AI generates new content featuring you or your product in a consistent style."
    },
    {
        question: "What is 'Bring Your Own Key' (BYOK)?",
        answer: "For users on our highest tiers (Elite/Agency) who have very high generation needs, we offer a BYOK model. Once you consume your generous monthly AI credits, you can connect your own Google AI API key. All subsequent AI requests will be billed directly to your Google Cloud account at their standard rates, allowing for virtually unlimited generation at cost."
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