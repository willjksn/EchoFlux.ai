

import React from 'react';
import { LogoIcon } from './icons/UIIcons';

export const About: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 text-gray-700 dark:text-gray-300">
            <div className="text-center">
                 <div className="flex items-center justify-center">
                    <LogoIcon />
                    <span className="ml-2 text-4xl font-bold" style={{ color: '#2563eb' }}>EchoFlux.ai</span>
                 </div>
                <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">The AI Social Operating System for Creators</h2>
                    <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">From strategy to execution, we built the ultimate command center for modern creators.</p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Our Evolution</h3>
                <div className="space-y-4 prose prose-lg dark:prose-invert max-w-none">
                    <p>EchoFlux.ai began with a simple goal: to help creators automate replies. But automation is just the baseline. True growth requires strategy, deep relationships, and seamless execution.</p>
                    <p>Today, EchoFlux.ai has transformed into a comprehensive <strong>Social Operating System</strong>. We replaced the cluttered inbox with a strategic <strong>Command Center</strong> that gives you a 360-degree view of your brand's health.</p>
                    
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mt-6">The 8 Pillars of EchoFlux</h4>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Quick Post Automation:</strong> Upload multiple images or videos, select your platforms, and let AI automatically create captions, hashtags, and schedule posts at optimal times. Perfect for busy creators who need to maintain a consistent presence.</li>
                        <li><strong>Central Command:</strong> A unified dashboard that highlights what matters—your account health, upcoming schedule, and urgent tasks—so you never feel lost in the noise.</li>
                        <li><strong>AI Strategy Engine:</strong> Stop guessing what to post. Our AI Content Strategist builds multi-week content roadmaps with image and video ideas tailored to your niche and goals. Upload media directly to roadmap items and auto-schedule posts to your calendar.</li>
                        <li><strong>Media Library:</strong> Upload and organize images and videos in your personal media library. Reuse assets across posts, select from library when composing, and keep your content organized for maximum efficiency.</li>
                        <li><strong>Intelligent CRM:</strong> Turn interactions into relationships. Tag leads, keep internal notes, and track customer history instantly from your inbox.</li>
                        <li><strong>Visual Planning:</strong> A beautiful calendar view that lets you preview, edit, and manage all your scheduled content. Click any post to preview, edit date/time/platforms, or delete—all in one place.</li>
                        <li><strong>Conversion Engine:</strong> We close the loop with our "Smart Link-in-Bio" builder, turning engagement into owned assets like email lists.</li>
                    </ul>

                    <p className="mt-6">Our mission is to replace your fragmented stack of 10 different tools with one cohesive, AI-powered platform. We handle the busy work—from strategy to scheduling—so you can focus on the big picture and grow your brand authentically.</p>
                </div>
            </div>
        </div>
    );
};