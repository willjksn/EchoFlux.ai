import React, { useState } from 'react';

const faqData = [
    {
        question: "Who is EchoFlux.ai for right now?",
        answer: "We're focused on creators. Everything is tuned for personal brands: follower growth, engagement, fast publishing, and running your fan business from one place."
    },
    {
        question: "What is EchoFlux.ai?",
        answer: "EchoFlux.ai is your creator studio—the app you sign into to plan content with AI, manage your calendar, run Fan Hub (memberships, store, tips, messages, sessions), and control how fans experience your brand. All configuration and day-to-day work happens here."
    },
    {
        question: "What is Fan Hub?",
        answer: "Fan Hub is your built-in fan storefront and community surface inside EchoFlux. You customize your page, turn on what you want (subscriptions, tips, paid posts, digital products, DMs, video sessions, branding), and set pricing. Fans only see what you enable; you stay in control of offers and access."
    },
    {
        question: "What is witme.io?",
        answer: "witme.io is the public, fan-friendly home for creator pages. It’s where many fans land from your bio link: one place to join, shop, tip, and message—without hunting across apps. What they can do there matches what you’ve turned on in Fan Hub. There isn’t a separate “witme signup” for creators; you run everything from EchoFlux and share your witme.io URL (for example witme.io/yourhandle) with your audience."
    },
    {
        question: "How do EchoFlux, Fan Hub, and witme fit together?",
        answer: "EchoFlux is the creator app you log into: content tools, calendar, settings, and everything you use to run your business. Fan Hub is the fan-facing side of that same product—the storefront and community tools you turn on (subscriptions, store, tips, DMs, sessions, and more). You configure Fan Hub entirely inside EchoFlux. witme.io is simply where your public fan page lives on the web; fans usually open witme.io/yourhandle from your bio and see exactly what you’ve enabled in Fan Hub. One account, one product—not three separate services."
    },
    {
        question: "What platforms can I plan content for?",
        answer: "EchoFlux.ai supports content planning for all major social platforms including Instagram, TikTok, Twitter/X, Facebook, LinkedIn, Pinterest, and YouTube. Plan your content once and adapt it for any platform."
    },
    {
        question: "What is AI Content Generation?",
        answer: "Upload your images or videos, set your goal and tone, and our AI generates captions and relevant hashtags tailored to your content and target platforms. You can save as a draft, add it to your calendar, then publish when you're ready—or turn on auto-post so it goes live at the scheduled time when your account is connected (X, Instagram, and Facebook are supported; you can still copy/export or post manually anytime)."
    },
    {
        question: "How does What to Post work?",
        answer: "Tell us your niche and goals, and What to Post builds a multi-week content roadmap with post ideas. Upload media directly to roadmap items, and it adds them as planned content on your schedule so you always know what to post next."
    },
    {
        question: "Can I replace Linktree with EchoFlux?",
        answer: "Yes. Use your witme.io link (for example witme.io/yourhandle) in your bio. Fans land on your Fan Hub page—one place to subscribe, tip, shop, and message, based on what you turn on in EchoFlux—instead of a generic link-in-bio that only lists buttons."
    },
    {
        question: "Do you have an AI assistant or chatbot?",
        answer: "Yes. EchoFlux.ai includes an in-app chatbot to help with planning workflows and how to use the app."
    },
    {
        question: "Do I need to connect Instagram, X, or Facebook to use EchoFlux?",
        answer: "No. Fan Hub, witme.io, AI captions, your calendar, and What to Post all work without linking social accounts—you can plan content and run your fan business from EchoFlux either way. Connect X, Instagram, or Facebook when you want in-app publishing: Publish Now or scheduled auto-post at the time you set (where you've enabled auto-post). You can still copy/export and post manually whenever you prefer."
    },
    {
        question: "What happens after the 7-day trial?",
        answer: "When your trial ends, we charge your card for the plan you chose (Pro or Elite). If you cancel anytime before the trial ends, you won't be charged. You can cancel from Settings or by contacting us. We'll also send you a reminder before your trial ends."
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
                    EchoFlux, Fan Hub, witme.io, content tools, and billing—what creators ask us most.
                </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                {faqData.map((faq, index) => (
                    <FaqItem key={index} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </div>
    );
};
