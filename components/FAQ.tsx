import React, { useState } from 'react';

const faqData = [
    {
        question: "Who is EchoFlux.ai for right now?",
        answer: "We're focused on creators. Everything is tuned for personal brands: follower growth, engagement, fast publishing, and running your fan business from one place."
    },
    {
        question: "What is EchoFlux.ai?",
        answer: "EchoFlux.ai is the creator studio you sign into. Use the sidebar to plan content (Plan), write captions (Create Post), organize media (Vault), schedule posts (Calendar), run your fan business (Fan Hub), and tune AI in Settings → Profile & AI. Your public fan page lives on witme.io; you configure it all from EchoFlux."
    },
    {
        question: "What is Fan Hub?",
        answer: "Fan Hub is your built-in fan storefront and community inside EchoFlux. Top tabs include My Page (branding and witme.io link), Posts (feed and, on Elite, Post ideas and Drop plan), Store, Messages, and more depending on your plan. Turn on subscriptions, tips, paid posts, digital products, DMs, video sessions, and live streams (Elite). Fans only see what you enable."
    },
    {
        question: "What is witme.io?",
        answer: "witme.io is the public home for your fan page—for example witme.io/yourhandle. Fans use it from your bio to subscribe, shop, tip, and message you. There is no separate creator signup on witme.io; you set everything up in EchoFlux Fan Hub and share that link."
    },
    {
        question: "How do EchoFlux, Fan Hub, and witme fit together?",
        answer: "EchoFlux is the creator app: Plan, Create Post, Calendar, Vault, Settings, and Fan Hub configuration. Fan Hub is the same product's fan-facing tools (page, posts, store, messages). witme.io is the URL fans open on the web; it shows what you enabled in Fan Hub. One account—not three separate services."
    },
    {
        question: "How does Plan work?",
        answer: "Click Plan in the sidebar. Today gives quick daily ideas with hooks and what-to-create blueprints for Instagram, Facebook, X, or My Page—tap Use this to open Create Post or Fan Hub with context filled in. Weekly monetization (Pro+) maps your money flow: today's move, weekly grid, and what to publish. Multi-week strategy (Elite) builds longer themed roadmaps you can send to your calendar."
    },
    {
        question: "What is Create Post?",
        answer: "Create Post (sidebar label) is where you upload media, pick Instagram, Facebook, X, or My Page, and generate AI captions and hashtags. Save drafts, schedule on your calendar, publish manually, or auto-post when Instagram, X, or Facebook are connected. Ideas from Plan → Today can hand off here with caption context already set."
    },
    {
        question: "What are Post ideas and Drop plan?",
        answer: "Elite creators open Fan Hub → Posts to find Post ideas (member-content blueprints: what to film, photograph, or write) and Drop plan (structured drop campaigns). These replace the old separate Premium Studio entry—same tools, now inside Fan Hub Posts."
    },
    {
        question: "Which platforms does EchoFlux support?",
        answer: "Plan → Today and Create Post are built for Instagram, Facebook, X (Twitter), and My Page (your Fan Hub feed). Pick one when generating ideas or captions so the AI matches that destination. Your calendar can track content for any network; copy captions and post manually anywhere. In-app auto-post, when you connect accounts, works for Instagram, X, and Facebook only—not TikTok, LinkedIn, or YouTube in the picker today."
    },
    {
        question: "Do I need to connect Instagram, X, or Facebook to use EchoFlux?",
        answer: "No. Fan Hub, witme.io, Plan, Create Post, Vault, and Calendar all work without linking social accounts. Connect Instagram, X, or Facebook when you want Publish Now or scheduled auto-post from Create Post or your calendar. You can always copy captions and post manually on any network, including TikTok."
    },
    {
        question: "What's the difference between Pro and Elite?",
        answer: "Pro includes Plan → Today, Create Post, Calendar, Vault (5 GB), Fan Hub with witme.io, subscriptions, tips, store, messages, and basic analytics. Elite adds Plan → Weekly monetization, Plan → Multi-week strategy, Fan Hub live streams, Fan Hub → Posts (Post ideas and Drop plan), Creator Identity in Settings → Profile & AI, chat session planner, AI reply drafts for DMs and feed comments, more video chat minutes, advanced analytics, and 10 GB Vault storage."
    },
    {
        question: "Can I replace Linktree with EchoFlux?",
        answer: "Yes. Put your witme.io/yourhandle link in your bio. Fans land on your Fan Hub page—subscribe, tip, shop, and message in one place based on what you turned on in EchoFlux—instead of a generic link list."
    },
    {
        question: "Do you have an AI assistant or chatbot?",
        answer: "Yes. Use the EchoFlux assistant (chat icon, bottom-right) for step-by-step help with Plan, Create Post, Fan Hub, witme.io, and billing. It knows current sidebar labels and click paths. Text chat is available to all creators; voice in the assistant is for admin accounts only."
    },
    {
        question: "What happens after the 7-day trial?",
        answer: "When your trial ends, we charge your card for the plan you chose (Pro or Elite). Cancel anytime before the trial ends and you will not be charged. Cancel from Settings or contact support. We send a reminder before the trial ends."
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
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
                    Plan, Create Post, Fan Hub, witme.io, platforms, and billing—updated for the current app.
                </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                {faqData.map((faq, index) => (
                    <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </div>
    );
};
