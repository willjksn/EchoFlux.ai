import React, { useState } from 'react';
import { CheckCircleIcon, SparklesIcon } from './icons/UIIcons';

type GuideSection = 'upload' | 'posting' | 'captions' | 'monetization' | 'best-practices';

export const OnlyFansGuides: React.FC = () => {
    const [activeSection, setActiveSection] = useState<GuideSection>('upload');

    const sections: { id: GuideSection; label: string }[] = [
        { id: 'upload', label: 'Manual Upload Guide' },
        { id: 'posting', label: 'Best Times to Post' },
        { id: 'captions', label: 'Caption Best Practices' },
        { id: 'monetization', label: 'Monetization Strategy' },
        { id: 'best-practices', label: 'Best Practices' },
    ];

    const uploadSteps = [
        {
            title: 'Step 1: Prepare Your Content',
            content: [
                'Organize your media in the Media Vault with proper folders',
                'Use AI tagging to help organize content by outfits, poses, and vibes',
                'Ensure content meets OnlyFans guidelines (no prohibited content)',
                'Check image/video quality and resolution',
            ],
        },
        {
            title: 'Step 2: Generate Captions',
            content: [
                'Use the Content Brain to generate engaging captions',
                'Choose appropriate tone (Playful, Teasing, Explicit, etc.)',
                'Include relevant hashtags and engagement prompts',
                'Customize captions based on your audience and content type',
            ],
        },
        {
            title: 'Step 3: Upload to OnlyFans',
            content: [
                'Log into your OnlyFans account',
                'Navigate to the "Posts" section',
                'Click "Create Post" or "Add Media"',
                'Select your prepared media files',
                'Paste the generated caption',
                'Set post visibility (Free, Paid, or Subscription-only)',
                'Add price if it\'s a paid post',
                'Preview before publishing',
            ],
        },
        {
            title: 'Step 4: Schedule or Publish',
            content: [
                'Review all settings (visibility, price, tags)',
                'Choose "Publish Now" or "Schedule" for later',
                'If scheduling, set the date and time',
                'Confirm and publish',
                'Share teaser content to other platforms to drive traffic',
            ],
        },
    ];

    const postingTimes = [
        {
            time: '6:00 AM - 9:00 AM',
            audience: 'Morning commuters and early risers',
            tip: 'Great for engagement from users checking their phones before work',
        },
        {
            time: '12:00 PM - 2:00 PM',
            audience: 'Lunch break viewers',
            tip: 'Peak engagement during lunch hours',
        },
        {
            time: '5:00 PM - 7:00 PM',
            audience: 'Evening commuters and after-work browsing',
            tip: 'High traffic time as users finish work',
        },
        {
            time: '8:00 PM - 11:00 PM',
            audience: 'Evening leisure time',
            tip: 'Prime time for engagement and purchases',
        },
        {
            time: 'Weekends',
            audience: 'Increased free time',
            tip: 'Generally higher engagement and conversion rates',
        },
    ];

    const captionTips = [
        {
            category: 'Engagement',
            tips: [
                'Ask questions to encourage comments',
                'Use call-to-action (CTA) phrases like "Tell me what you think" or "What would you do?"',
                'Create curiosity with teaser language',
                'Use emojis strategically to add personality',
            ],
        },
        {
            category: 'Monetization',
            tips: [
                'Include clear CTAs for paid content ("Unlock the full set", "DM for exclusive")',
                'Create urgency ("Limited time offer", "Only available today")',
                'Mention exclusive content benefits',
                'Use direct but playful language about paid content',
            ],
        },
        {
            category: 'Tone & Style',
            tips: [
                'Match caption tone to your content type and persona',
                'Use explicit language when appropriate for your audience',
                'Maintain consistency with your brand voice',
                'Personalize messages to create connection',
            ],
        },
        {
            category: 'Hashtags',
            tips: [
                'Use relevant OnlyFans-specific hashtags',
                'Include niche-specific tags',
                'Don\'t overuse hashtags (5-10 is optimal)',
                'Mix popular and niche hashtags for discoverability',
            ],
        },
    ];

    const monetizationStrategies = [
        {
            strategy: 'Free vs. Paid Content Balance',
            description: 'Maintain a good mix of free teaser content and paid exclusive content',
            tips: [
                'Post free content regularly to maintain engagement',
                'Use free posts to showcase your style and attract subscribers',
                'Offer premium content at strategic moments',
                'Create a content tier system (Free, Subscription-only, Paid extra)',
            ],
        },
        {
            strategy: 'Pricing Strategy',
            description: 'Set appropriate prices based on content type and audience',
            tips: [
                'Start with competitive prices and adjust based on performance',
                'Price longer videos and exclusive content higher',
                'Offer bundle deals for multiple items',
                'Create time-limited offers to drive urgency',
            ],
        },
        {
            strategy: 'Upselling & Cross-selling',
            description: 'Maximize revenue from existing subscribers',
            tips: [
                'Mention other available content in captions',
                'Use DM marketing for personalized offers',
                'Create themed content series that encourage multiple purchases',
                'Offer custom content requests at premium prices',
            ],
        },
        {
            strategy: 'Subscriber Retention',
            description: 'Keep subscribers engaged and renewing',
            tips: [
                'Post consistently to maintain subscriber interest',
                'Engage with subscriber messages and requests',
                'Offer subscriber-exclusive content and perks',
                'Create a sense of community and connection',
            ],
        },
    ];

    const bestPractices = [
        {
            category: 'Content Quality',
            practices: [
                'Maintain high-quality images and videos',
                'Use good lighting and composition',
                'Edit content for professional appearance',
                'Keep content fresh and varied',
                'Plan content in advance using the Content Calendar',
            ],
        },
        {
            category: 'Consistency',
            practices: [
                'Post regularly (daily or multiple times per week)',
                'Use the Content Calendar to plan your posting schedule',
                'Maintain consistent posting times',
                'Keep your brand voice and style consistent',
            ],
        },
        {
            category: 'Engagement',
            practices: [
                'Respond to subscriber messages promptly',
                'Engage with comments and feedback',
                'Use interactive posts to drive engagement',
                'Show appreciation for subscribers and tips',
            ],
        },
        {
            category: 'Legal & Safety',
            practices: [
                'Follow OnlyFans terms of service and community guidelines',
                'Verify subscriber age (OnlyFans handles this, but be aware)',
                'Protect your personal information',
                'Watermark your content to prevent unauthorized sharing',
                'Use secure payment methods',
            ],
        },
    ];

    const renderContent = () => {
        switch (activeSection) {
            case 'upload':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Manual Upload Guide
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Follow these steps to manually upload content to your OnlyFans account using content prepared in OnlyFans Studio.
                            </p>
                        </div>
                        {uploadSteps.map((step, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                            {step.title}
                                        </h3>
                                        <ul className="space-y-2">
                                            {step.content.map((item, itemIndex) => (
                                                <li key={itemIndex} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                                    <CheckCircleIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'posting':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Best Times to Post
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Posting at optimal times can significantly increase engagement and monetization. Use the Content Calendar to schedule your posts.
                            </p>
                        </div>
                        <div className="grid gap-4">
                            {postingTimes.map((timeSlot, index) => (
                                <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {timeSlot.time}
                                        </h3>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                        <strong>Audience:</strong> {timeSlot.audience}
                                    </p>
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        💡 <strong>Tip:</strong> {timeSlot.tip}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'captions':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Caption Best Practices
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Effective captions drive engagement and monetization. Use the Content Brain to generate optimized captions.
                            </p>
                        </div>
                        {captionTips.map((category, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                    {category.category}
                                </h3>
                                <ul className="space-y-3">
                                    {category.tips.map((tip, tipIndex) => (
                                        <li key={tipIndex} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                                            <CheckCircleIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                                            <span>{tip}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                );
            case 'monetization':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Monetization Strategy Tips
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Maximize your earnings with these proven monetization strategies.
                            </p>
                        </div>
                        {monetizationStrategies.map((strategy, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                    {strategy.strategy}
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                    {strategy.description}
                                </p>
                                <ul className="space-y-2">
                                    {strategy.tips.map((tip, tipIndex) => (
                                        <li key={tipIndex} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                                            <CheckCircleIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                                            <span>{tip}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                );
            case 'best-practices':
                return (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                Best Practices for Success
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Follow these best practices to build a successful OnlyFans presence.
                            </p>
                        </div>
                        {bestPractices.map((category, index) => (
                            <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                    {category.category}
                                </h3>
                                <ul className="space-y-3">
                                    {category.practices.map((practice, practiceIndex) => (
                                        <li key={practiceIndex} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                                            <CheckCircleIcon className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                                            <span>{practice}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Guides & Tips
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Learn best practices, strategies, and step-by-step guides for successful OnlyFans content creation.
                </p>
            </div>

            {/* Sections */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {sections.map((section) => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                            activeSection === section.id
                                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        {section.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                {renderContent()}
            </div>
        </div>
    );
};
