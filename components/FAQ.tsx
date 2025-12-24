import React, { useState } from 'react';

const faqData = [
    {
        question: "Who is EchoFlux.ai for right now?",
        answer: "We’re focused on creators. Everything is tuned for personal brands: follower growth, engagement, and fast publishing. Business/agency modes are paused until the creator experience is perfect."
    },
    {
        question: "Do you support businesses or agencies?",
        answer: "Not right now. We’ve hidden business and agency features to perfect the creator experience. We’ll bring them back later after creator launch and testing."
    },
    {
        question: "What is AI Content Generation?",
        answer: "Upload your images or videos, set your goal and tone, and our AI automatically generates engaging captions and relevant hashtags tailored to your content and target platforms. You can then schedule your posts or save them as drafts for manual posting when you're ready."
    },
    {
        question: "How does the AI Content Strategist work?",
        answer: "Tell us your niche and goals, and it builds a multi-week content roadmap with post ideas. Upload media directly to roadmap items, and it adds them as planned content on your calendar so you always know what to post next."
    },
    {
        question: "Can I replace Linktree with EchoFlux?",
        answer: "Yes. Our Smart Link-in-Bio gives you a branded mobile page with optional email capture so you can grow owned audience directly from Instagram or TikTok."
    },
    {
        question: "Do you offer social listening or competitor tracking?",
        answer: "We’ve removed social listening and competitor tracking for now. Current focus: AI content creation, campaign planning, inbox/CRM, analytics-style insights, link-in-bio, and OnlyFans Studio."
    },
    {
        question: "Can I use EchoFlux.ai without connecting social accounts?",
        answer: "Yes. Right now EchoFlux.ai is designed as an AI Content Studio & Campaign Planner—you plan campaigns, generate content, and organize everything in a calendar, then copy and post to your social platforms manually. Direct posting and deep analytics will come in a future version."
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