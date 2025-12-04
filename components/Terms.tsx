import React from 'react';

export const Terms: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service & Fair Use Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: January 2025</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>Welcome to EngageSuite.ai. Our goal is to provide a powerful and sustainable AI toolkit to help you grow. This Fair Use Policy outlines the usage limits for our AI generation features to ensure service quality and prevent abuse for all our users. By using our service, you agree to these terms.</p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. AI-Powered Services</h3>
                    <p>
                        EngageSuite.ai offers advanced AI-powered content creation tools, including caption generation, content strategy, and automated post scheduling. These features use AI to analyze your media, generate captions and hashtags, and optimize posting times. This policy ensures we can offer these services sustainably.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. Subscription Plans and Pricing</h3>
                    <p>
                        Our pricing is available on our website's pricing section. All prices are listed in USD. The Agency plan is offered on a custom basis for users with extensive needs, and interested parties should contact our sales team for a quote. We reserve the right to change our pricing at any time, with notice provided to existing subscribers.
                    </p>
                    
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. Quick Post Automation Feature</h3>
                    <p>
                        Quick Post Automation is available on all paid plans. It automates the content creation workflow by analyzing uploaded media and generating captions, hashtags, and optimal posting schedules.
                    </p>
                     <ul>
                        <li><strong>Functionality:</strong> Upload multiple images or videos, select your target platforms, set your goal and tone, and our AI will analyze each piece of media to generate captions, hashtags, and schedule posts at optimal times.</li>
                        <li><strong>Platform Selection:</strong> You can select which social media platforms each post should be published to. The AI will optimize content and scheduling for each selected platform.</li>
                        <li><strong>Media Library Integration:</strong> Uploaded media is stored in your Media Library for future reuse. Media remains in your library until you delete it.</li>
                        <li><strong>Control:</strong> All automated posts are scheduled and can be reviewed, edited, or deleted from your Calendar before they go live. You retain full control over your brand's voice and output.</li>
                    </ul>


                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Fair Use Policy & Monthly Allowances</h3>
                    <p>
                        Different subscription plans come with different allowances for AI generation. These are designed to provide ample creative freedom while maintaining service stability.
                    </p>
                    
                    <h4>Media Storage Allowance</h4>
                     <p>
                        Users can upload their own media (images and videos) for use in features like caption generation, Quick Post Automation, and the Media Library. Each plan comes with a specific storage limit:
                    </p>
                    <ul>
                        <li><strong>Free Plan:</strong> 100 MB of media storage.</li>
                        <li><strong>Creator Pro Plan:</strong> 1 GB of media storage.</li>
                        <li><strong>Creator Elite Plan:</strong> 2 GB of media storage.</li>
                        <li><strong>Creator Agency Plan:</strong> 5 GB of media storage.</li>
                        <li><strong>Business Starter Plan:</strong> 1 GB of media storage.</li>
                        <li><strong>Business Growth Plan:</strong> 3 GB of media storage.</li>
                    </ul>
                    <p>
                        Media uploaded to your Media Library remains stored until you delete it. Storage usage is calculated across all uploaded media including profile pictures, link-in-bio images, and media library items.
                    </p>

                    <h4>AI Reply Generation</h4>
                    <p>
                        All plans include AI-powered reply generation for DMs and comments. Monthly limits are as follows:
                    </p>
                    <ul>
                        <li><strong>Free Plan:</strong> 50 AI Replies per month.</li>
                        <li><strong>Creator Pro Plan:</strong> 250 AI Replies per month.</li>
                        <li><strong>Creator Elite Plan:</strong> 750 AI Replies per month.</li>
                        <li><strong>Creator Agency Plan:</strong> 2,000 AI Replies per month.</li>
                        <li><strong>Business Starter Plan:</strong> 500 AI Replies per month.</li>
                        <li><strong>Business Growth Plan:</strong> 1,500 AI Replies per month.</li>
                    </ul>
                    <p>
                        Credits reset on your monthly billing date. Unused credits do not roll over to the next month.
                    </p>


                    <h4>Media Library</h4>
                    <p>
                        All paid plans include access to the Media Library feature, which allows you to upload, organize, and reuse images and videos across your posts. Media stored in your library counts toward your plan's storage allowance.
                    </p>
                    <ul>
                        <li><strong>Storage Limits:</strong> Media Library storage is included in your plan's overall media storage allowance (see Media Storage Allowance section above).</li>
                        <li><strong>Retention:</strong> Media remains in your library until you explicitly delete it. Deleted media cannot be recovered.</li>
                        <li><strong>Usage:</strong> You can select media from your library when composing posts or adding media to strategy roadmap items.</li>
                    </ul>

                    <div className="mt-8 p-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-yellow-800 dark:text-yellow-200">Important: Policy on Client Usage (Elite & Agency Plans)</h4>
                        <p className="mt-2 text-yellow-900 dark:text-yellow-100">
                           The monthly allowances for all AI generation features are allocated to the <strong>primary subscriber's account only</strong>. These allowances are intended to be used across all managed clients and are <strong>not provided on a per-client basis.</strong>
                        </p>
                        <p className="mt-2 text-yellow-900 dark:text-yellow-100">
                            <strong>Example:</strong> An Agency subscriber managing 10 clients has a total monthly allowance of 50 video generations to use for any of their clients' needs. It is not an allowance of 50 video generations for <em>each</em> of the 10 clients.
                        </p>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Prohibited Content & Use</h3>
                    <p>
                        You may not use EngageSuite.ai to create, upload, or share any content that is illegal, harmful, fraudulent, deceptive, infringes on any third party's rights, constitutes hate speech, or promotes self-harm. Violating this policy may result in immediate account suspension or termination.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Changes to This Policy</h3>
                    <p>
                        We may update this Fair Use Policy from time to time. If we make any changes, we will notify you by revising the "Last updated" date at the top of this policy and, in some cases, we may provide you with additional notice.
                    </p>
                </div>
            </div>
        </div>
    );
};
