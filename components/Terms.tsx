import React from 'react';

export const Terms: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service & Fair Use Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: January 2025</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        Welcome to EchoFlux.ai. Our goal is to provide a focused, offline-first AI content studio and campaign
                        planner for creators. These Terms of Service and Fair Use guidelines explain how you may use the app
                        today, in its creator–planning mode, without relying on live platform integrations or automated posting.
                        By using EchoFlux.ai, you agree to these terms.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        1. Service Overview (Offline / Planning Mode)
                    </h3>
                    <p>
                        EchoFlux.ai currently operates as an <strong>AI Content Studio & Campaign Planner</strong>. The product is designed
                        to help you plan, brainstorm, and organize your content, not to replace your social platforms or post on your
                        behalf.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            The app focuses on strategy, content ideas, captions, content packs, calendars, and workflow boards
                            so you can manually post on the platforms you choose.
                        </li>
                        <li>
                            Any references in the UI to “publish”, “schedule”, or “platforms” are for planning purposes only
                            and do <strong>not</strong> guarantee live integrations, posting, analytics, or inbox tooling.
                        </li>
                        <li>
                            We may add, change, or remove integrations and features over time. EchoFlux.ai does not guarantee
                            support for any specific social network or third‑party platform.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        2. AI‑Powered Services
                    </h3>
                    <p>
                        EchoFlux.ai offers AI‑powered tools for captions, hooks, content ideas, planning roadmaps, and campaign
                        structures. In some plans these tools may also suggest time windows, content pillars, and calendar
                        placements.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            AI outputs are suggestions only. You are responsible for reviewing, editing, and deciding what
                            to actually post on your social accounts or platforms.
                        </li>
                        <li>
                            We do not guarantee that AI suggestions will perform in any particular way (e.g. reach, revenue,
                            engagement, or follower growth).
                        </li>
                        <li>
                            You are responsible for ensuring your final content complies with the terms and policies of any
                            platforms where you post.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        3. Subscription Plans and Pricing
                    </h3>
                    <p>
                        Plan names, limits, and prices are shown in the Pricing section of the app or on our website. We are
                        currently focused on creator‑oriented plans; agency/business features may be paused or hidden in this
                        version.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            We may change plan features, limits, or pricing in the future. If you are a paying subscriber, we
                            will make reasonable efforts to notify you before material changes take effect.
                        </li>
                        <li>
                            Any promotional or beta features may be modified or discontinued at any time.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        4. Fair Use Policy & Monthly Allowances
                    </h3>
                    <p>
                        Different subscription tiers may include different soft limits or allowances for AI generation, media
                        storage, or usage of specific tools (for example: number of AI captions per month). These limits are
                        designed to provide room for serious creators while keeping the service stable and sustainable.
                    </p>
                    
                    <h4>AI Caption Generation</h4>
                    <p>
                        All paid plans include AI-powered caption generation with trending hashtags. Monthly limits are as follows:
                    </p>
                    <ul>
                        <li><strong>Free Plan:</strong> No AI Captions included.</li>
                        <li><strong>Caption Pro Plan:</strong> 100 AI Captions per month.</li>
                        <li><strong>Creator Pro Plan:</strong> 500 AI Captions per month.</li>
                        <li><strong>Creator Elite Plan:</strong> 1,500 AI Captions per month.</li>
                    </ul>
                    <p>
                        Credits reset on your monthly billing date. Unused credits do not roll over to the next month.
                    </p>

                    <h4>Media Storage Allowance</h4>
                     <p>
                        Users can upload their own media (images and videos) for use in features like caption generation, Quick Post Automation, and the Media Library. Each plan comes with a specific storage limit:
                    </p>
                    <ul>
                        <li><strong>Free Plan:</strong> 100 MB of media storage.</li>
                        <li><strong>Caption Pro Plan:</strong> Basic Link-in-Bio only (no Media Library).</li>
                        <li><strong>Creator Pro Plan:</strong> 1 GB of media storage.</li>
                        <li><strong>Creator Elite Plan:</strong> 2 GB of media storage.</li>
                    </ul>
                    <p>
                        Media uploaded to your Media Library remains stored until you delete it. Storage usage is calculated across all uploaded media including profile pictures, link-in-bio images, and media library items.
                    </p>

                    <h4>AI Reply Generation</h4>
                    <p>
                        All plans include AI-powered reply generation for DMs and comments. Monthly limits are as follows:
                    </p>
                    <ul>
                        <li><strong>Free Plan:</strong> 25 AI Replies per month.</li>
                        <li><strong>Caption Pro Plan:</strong> Not included (caption generation only).</li>
                        <li><strong>Creator Pro Plan:</strong> 250 AI Replies per month.</li>
                        <li><strong>Creator Elite Plan:</strong> 750 AI Replies per month.</li>
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


                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Prohibited Use</h3>
                    <p>
                        You may not use EchoFlux.AI to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Circumvent API limitations imposed by third-party platforms.</li>
                        <li>Automate prohibited behaviors such as mass messaging, follower automation, or scraping.</li>
                        <li>Attempt to access non-permitted data or violate any platform's Terms of Service.</li>
                        <li>Create, upload, or share any content that is illegal, harmful, fraudulent, deceptive, infringes on any third party's rights, constitutes hate speech, or promotes self-harm.</li>
                    </ul>
                    <p className="mt-4">
                        Violating this policy may result in immediate account suspension or termination.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Changes to These Terms</h3>
                    <p>
                        We may update these Terms of Service and Fair Use guidelines from time to time. If we make any changes,
                        we will update the “Last updated” date at the top of the page and, where appropriate, provide additional
                        notice in the app or by email.
                    </p>
                </div>
            </div>
        </div>
    );
};
