

import React from 'react';
import { LogoIcon } from './icons/UIIcons';

export const About: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 text-gray-700 dark:text-gray-300">
            <div className="text-center">
                 <div className="flex items-center justify-center text-primary-600 dark:text-primary-400">
                    <LogoIcon />
                    <span className="ml-2 text-4xl font-bold">EngageSuite.ai</span>
                 </div>
                <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">The First AI Social Operating System</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">From strategy to execution, we built the ultimate command center for modern brands and agencies.</p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Our Evolution</h3>
                <div className="space-y-4 prose prose-lg dark:prose-invert max-w-none">
                    <p>EngageSuite.ai began with a simple goal: to help creators automate replies. But automation is just the baseline. True growth requires strategy, deep relationships, and seamless execution.</p>
                    <p>Today, EngageSuite.ai has transformed into a comprehensive <strong>Social Operating System</strong>. We replaced the cluttered inbox with a strategic <strong>Command Center</strong> that gives you a 360-degree view of your brand's health.</p>
                    
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mt-6">The 8 Pillars of EngageSuite</h4>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>AI Autopilot:</strong> The ultimate workflow. Set a high-level goal (e.g., "Promote new product"), and our AI will generate a multi-week strategy, create all the content (images and captions), and queue them up for your final approval.</li>
                        <li><strong>Central Command:</strong> A unified dashboard that highlights what matters—your account health, upcoming schedule, and urgent tasks—so you never feel lost in the noise.</li>
                        <li><strong>AI Strategy Engine:</strong> Stop guessing what to post. Our AI Strategist builds 4-week content roadmaps aligned with your niche and goals.</li>
                        <li><strong>Generative Content Studio:</strong> Create images, videos (Veo), and captions instantly. Use our Remix engine to turn one post into content for every platform.</li>
                        <li><strong>Intelligent CRM:</strong> Turn interactions into relationships. Tag leads, keep internal notes, and track customer history instantly from your inbox.</li>
                        <li><strong>Strategic Listening:</strong> We listen to the web for you. Track brand mentions and competitor moves to stay ahead of the curve.</li>
                        <li><strong>Visual Planning:</strong> A drag-and-drop calendar that bridges the gap between creation and scheduling, ensuring your content mix is perfect.</li>
                        <li><strong>Conversion Engine:</strong> We close the loop with our "Smart Link-in-Bio" builder, turning engagement into owned assets like email lists.</li>
                    </ul>

                    <p className="mt-6">Our mission is to replace your fragmented stack of 10 different tools with one cohesive, AI-powered platform. We handle the busy work so you can focus on the big picture.</p>
                </div>
            </div>
        </div>
    );
};