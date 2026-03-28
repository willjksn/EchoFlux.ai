import React from 'react';

export const Terms: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service & Fair Use Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: March 28, 2026</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        Welcome to EchoFlux.ai. EchoFlux is an all-in-one creator platform that combines AI-powered content tools, 
                        social media planning, and Fan Hub — a customizable storefront where creators can build their brand, 
                        connect with their audience, and monetize their content. By using EchoFlux.ai, you agree to these terms.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        1. Age Requirements and Eligibility
                    </h3>
                    <p>
                        <strong>Minimum Age Requirement:</strong> You must be at least <strong>18 years old</strong> to use EchoFlux.ai. 
                        By creating an account or using our services, you represent and warrant that you meet this minimum age requirement.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Age Verification:</strong> We reserve the right to verify your age at any time. If we discover that 
                            you have provided false information about your age, we may immediately suspend or terminate your account without notice.
                        </li>
                        <li>
                            <strong>Account Termination:</strong> We reserve the right to refuse service, suspend, or terminate accounts 
                            of users who do not meet age requirements or who provide false age information.
                        </li>
                    </ul>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <strong>Compliance with Laws:</strong> EchoFlux.ai complies with applicable laws and regulations. 
                        If you are aware of a user under 18 using our service, please contact us immediately at contact@echoflux.ai.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        2. Service Overview
                    </h3>
                    <p>
                        EchoFlux.ai is a comprehensive <strong>Creator Platform</strong> that provides:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>AI Content Studio:</strong> AI-powered tools for generating captions, content ideas, 
                            planning roadmaps, and campaign strategies for social media platforms like Instagram, Facebook, and X.
                        </li>
                        <li>
                            <strong>Fan Hub:</strong> A customizable storefront where creators can build their brand page, 
                            post content for members, sell digital products through your store, receive tips, and communicate with fans via direct messages.
                        </li>
                        <li>
                            <strong>Monetization Tools:</strong> Subscription memberships, one-time purchases, tips, 
                            video chat sessions, and other revenue streams powered by Stripe.
                        </li>
                        <li>
                            <strong>My Vault:</strong> Secure media storage for organizing images, videos, and audio files 
                            for use across posts and your Fan Hub.
                        </li>
                    </ul>
                    <p className="mt-2">
                        We may add, change, or remove features over time. EchoFlux.ai does not guarantee 
                        support for any specific third-party platform integration.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        3. Fan Hub — Creator Storefronts
                    </h3>
                    <p>
                        Fan Hub allows creators to build a personalized storefront at echoflux.ai/&#123;handle&#125; or on a custom domain.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Creator Responsibilities:</strong> As a creator, you are solely responsible for the content you post, 
                            the products you sell, and your interactions with fans. You must ensure your content complies with all applicable laws.
                        </li>
                        <li>
                            <strong>Content Standards:</strong> EchoFlux storefronts are designed for creators sharing lifestyle, fitness, 
                            fashion, art, music, coaching, and similar content. Content must comply with our Content Policy (see Section 7).
                        </li>
                        <li>
                            <strong>Payments & Platform Fee:</strong> All payments are processed through Stripe. Creators must have a valid Stripe Connect 
                            account to receive payouts. EchoFlux charges a <strong>10% platform fee</strong> on all Fan Hub transactions 
                            (subscriptions, tips, product sales, video sessions). This fee is deducted before payouts. Stripe's processing 
                            fees are additional and handled by Stripe.
                        </li>
                        <li>
                            <strong>Refunds:</strong> Refund policies are determined by the creator unless otherwise required by law. 
                            Digital content purchases are generally non-refundable.
                        </li>
                        <li>
                            <strong>Terms & Privacy:</strong> Creators can customize their own Terms of Service and Privacy Policy 
                            for their Fan Hub page. If not customized, default terms apply that describe the relationship between the creator, fans, and EchoFlux as platform provider.
                        </li>
                        <li>
                            <strong>Stripe Connect:</strong> To receive Fan Hub payouts, creators must complete Stripe Connect onboarding, 
                            keep account information accurate, and comply with Stripe's terms, identity requirements, and applicable tax and 
                            financial regulations. EchoFlux does not hold fan funds; payments are processed by Stripe to the creator's connected account, subject to Stripe's rules and holds.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        4. Fan Hub — Member/Fan Terms
                    </h3>
                    <p>
                        If you are a member (fan) accessing a creator's Fan Hub page:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Subscriptions:</strong> Memberships are recurring and will be charged each billing period until canceled. 
                            You can cancel anytime via Stripe's customer portal (link provided in your receipt email).
                        </li>
                        <li>
                            <strong>Content Usage:</strong> Content you access is for personal viewing only. You may not download, copy, 
                            screenshot, record, share, redistribute, or use any content outside the platform without written permission.
                        </li>
                        <li>
                            <strong>Messages:</strong> Direct messages are confidential. You may not share, copy, or distribute 
                            message content outside the app.
                        </li>
                        <li>
                            <strong>Behavior:</strong> You must be respectful in all interactions. Harassment, abuse, or inappropriate 
                            behavior may result in being blocked by the creator or banned from the platform.
                        </li>
                        <li>
                            <strong>Removal and blocking:</strong> Creators may remove or block fans at their discretion. When you are blocked, 
                            you may be unable to send direct messages or complete new purchases with that creator, even if you still hold an active subscription elsewhere on the platform. Access to paid periods and refunds follow the creator's stated policy and applicable law.
                        </li>
                        <li>
                            <strong>Reporting:</strong> You may report concerning messages or behavior through in-product tools where available. 
                            Reports may be reviewed by EchoFlux or the creator as needed for safety and legal compliance.
                        </li>
                        <li>
                            <strong>Your agreement with the creator:</strong> Your purchase of memberships, tips, digital goods, or sessions is a 
                            transaction with the creator. EchoFlux provides software, checkout, and infrastructure. The creator's Fan Hub terms and privacy notices (including defaults if they have not customized them) govern how that creator offers the Service to you, in addition to these Terms where EchoFlux is the contracting party for the creator account.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        5. AI-Powered Services
                    </h3>
                    <p>
                        EchoFlux.ai offers AI-powered tools for captions, content ideas, planning roadmaps, and campaign strategies.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            AI outputs are suggestions only. You are responsible for reviewing, editing, and deciding what 
                            to post on your social accounts or Fan Hub.
                        </li>
                        <li>
                            We do not guarantee that AI suggestions will perform in any particular way (e.g., reach, revenue, 
                            engagement, or follower growth).
                        </li>
                        <li>
                            You are responsible for ensuring your final content complies with the terms and policies of any 
                            platforms where you post.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        6. Subscription Plans and Pricing
                    </h3>
                    <p>
                        Plan names, limits, and prices are shown in the Pricing section of the app or on our website.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Pro Plan ($19/month):</strong> Includes AI content tools (fair use limits), My Vault storage (5 GB), 
                            Fan Hub with monetization features, and 100 video chat minutes per month.
                        </li>
                        <li>
                            <strong>Elite Plan ($39/month):</strong> Includes everything in Pro, plus advanced tools, increased storage (10 GB), 
                            priority support, and 250 video chat minutes per month.
                        </li>
                        <li>
                            <strong>Platform Fee:</strong> A 10% platform fee applies to all Fan Hub revenue (subscriptions, tips, 
                            product sales, video sessions). This is in addition to Stripe's payment processing fees.
                        </li>
                        <li>
                            We may change plan features, limits, or pricing in the future. Paying subscribers will be notified 
                            before material changes take effect.
                        </li>
                        <li>
                            Additional video chat minutes can be purchased as add-ons through the Settings page.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        7. Content Policy
                    </h3>
                    <p>
                        EchoFlux.ai is designed for creators sharing lifestyle, fitness, fashion, art, music, coaching, 
                        educational, and similar content. The following content is <strong>prohibited</strong>:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Content depicting minors in any inappropriate context</li>
                        <li>Non-consensual content of any kind</li>
                        <li>Content that promotes violence, hate speech, or discrimination</li>
                        <li>Illegal content or content that facilitates illegal activities</li>
                        <li>Content that infringes on intellectual property rights</li>
                        <li>Spam, scams, or fraudulent content</li>
                        <li>Content that violates the privacy of others</li>
                    </ul>
                    <p className="mt-4">
                        EchoFlux reserves the right to remove content and terminate accounts that violate this policy.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        8. Fair Use Policy & Rate Limits
                    </h3>
                    <p>
                        To keep the platform reliable and affordable for everyone, we apply fair use limits on AI features and other services.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>AI Fair Use:</strong> AI caption generation and other AI features are subject to fair use limits. 
                            This means reasonable, personal use for your own content creation. Automated bulk generation, reselling AI outputs, 
                            or using the service for multiple businesses under one account is not permitted.
                        </li>
                        <li>
                            <strong>Rate Limits:</strong> We apply rate limits to prevent abuse. If you hit a rate limit, wait briefly and try again. 
                            Repeated attempts to circumvent limits may result in account review.
                        </li>
                        <li>
                            <strong>Video Chat Minutes:</strong> Pro users receive 100 minutes per month; Elite users receive 250 minutes. 
                            Minutes reset on your billing date and do not roll over. Additional minutes can be purchased.
                        </li>
                        <li>
                            <strong>Storage:</strong> Media storage limits apply based on your plan (Pro: 5 GB, Elite: 10 GB).
                        </li>
                        <li>
                            <strong>Enforcement:</strong> Excessive or abusive usage may result in temporary throttling, usage caps, or account review.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        9. Prohibited Use
                    </h3>
                    <p>
                        You may not use EchoFlux.ai to:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Circumvent API limitations imposed by third-party platforms.</li>
                        <li>Automate prohibited behaviors such as mass messaging, follower automation, or scraping.</li>
                        <li>Attempt to access non-permitted data or violate any platform's Terms of Service.</li>
                        <li>Create, upload, or share any content that is illegal, harmful, fraudulent, deceptive, 
                            infringes on any third party's rights, constitutes hate speech, or promotes self-harm.</li>
                        <li>Impersonate another person or entity.</li>
                        <li>Use the platform to harass, stalk, or threaten others.</li>
                    </ul>
                    <p className="mt-4">
                        Violating this policy may result in immediate account suspension or termination.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        10. Intellectual Property
                    </h3>
                    <p>
                        You retain ownership of the content you create and upload. By using EchoFlux, you grant us a limited license 
                        to display, distribute, and process your content as necessary to provide the service.
                    </p>
                    <p className="mt-2">
                        EchoFlux.ai and its logos, features, and functionality are owned by us and are protected by copyright, 
                        trademark, and other intellectual property laws.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        11. Limitation of Liability
                    </h3>
                    <p>
                        EchoFlux.ai is provided "as is" without warranties of any kind. We are not liable for any indirect, 
                        incidental, special, consequential, or punitive damages arising from your use of the service.
                    </p>
                    <p className="mt-2">
                        We are not responsible for content posted by creators or the actions of any users on the platform. To the maximum 
                        extent permitted by law, we are not liable for disputes between creators and fans regarding products, services, 
                        refunds, or content quality; those matters are primarily between the creator and the fan, subject to Stripe's role 
                        in payment processing and mandatory consumer laws.
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the fullest extent 
                        the law allows.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        12. Changes to These Terms
                    </h3>
                    <p>
                        We may update these Terms of Service from time to time. If we make any changes, we will update the 
                        "Last updated" date at the top of the page and, where appropriate, provide additional notice in the app or by email.
                    </p>
                    <p className="mt-2">
                        Continued use of the service after changes constitutes acceptance of the updated terms.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        13. Legal Relationship: EchoFlux, Creators, and Fans
                    </h3>
                    <p>
                        EchoFlux provides the creator platform (including Fan Hub technology, authentication, payments integration, messaging, 
                        and related features). Creators are independent businesses or individuals responsible for their own content, pricing, 
                        refunds, tax filings, and legal relationship with their fans. Fans' purchases on a creator's Fan Hub are primarily 
                        between the fan and that creator; EchoFlux is not a party to that sale except as a technology and payments facilitator 
                        where Stripe Connect and our software are used.
                    </p>
                    <p className="mt-2">
                        Nothing in these Terms creates a partnership, agency, joint venture, or employment relationship between EchoFlux and 
                        creators, or between EchoFlux and fans.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        14. Creator Obligations (Account Holders)
                    </h3>
                    <p>If you operate a creator account on EchoFlux, you agree that you will:</p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Comply with applicable laws (including consumer protection, intellectual property, export controls, and tax obligations).</li>
                        <li>Not use Fan Hub to offer illegal goods or services, non-consensual content, or content that violates Section 7.</li>
                        <li>Maintain accurate Stripe Connect and payout information and honor your stated refund and cancellation policies where required by law.</li>
                        <li>Provide clear terms and privacy information to your fans (custom copy or the EchoFlux default templates).</li>
                        <li>Use blocking, messaging, and moderation tools responsibly and not for unlawful discrimination or harassment.</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        15. Indemnification by Creators
                    </h3>
                    <p>
                        To the fullest extent permitted by law, you (as a creator) agree to indemnify, defend, and hold harmless EchoFlux, 
                        its affiliates, and their respective directors, officers, employees, and contractors from any claims, damages, losses, 
                        liabilities, and expenses (including reasonable attorneys' fees) arising out of or related to: your Fan Hub content 
                        or offerings; your interactions with fans; your breach of these Terms; or your violation of third-party rights or 
                        applicable law. EchoFlux may assume exclusive defense of any matter subject to indemnification at its option.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        16. DMCA and Copyright Complaints
                    </h3>
                    <p>
                        We respect intellectual property rights. If you believe material on EchoFlux infringes your copyright, you may send 
                        a notice with the information required by the Digital Millennium Copyright Act (DMCA) to <strong>contact@echoflux.ai</strong>. 
                        We may remove or disable access to material in appropriate cases and may terminate repeat infringers where permitted by law.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        17. Dispute Resolution and Governing Law
                    </h3>
                    <p>
                        These Terms are governed by the laws of the United States and the State of Delaware, without regard to conflict-of-law 
                        principles, except that mandatory consumer protection laws in your place of residence may still apply where they cannot 
                        be waived. You agree that exclusive jurisdiction for disputes arising out of these Terms or your use of EchoFlux as 
                        a creator or visitor to echoflux.ai (excluding disputes that must be brought in another forum under mandatory law) lies 
                        in the state or federal courts located in Delaware, and you consent to personal jurisdiction there.
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Fans who only interact with a creator's Fan Hub may also have rights under the governing law described in that creator's 
                        Fan Hub terms where those terms apply to the fan–creator relationship.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        18. Electronic Communications and Assignment
                    </h3>
                    <p>
                        You consent to receive communications from us electronically (including email and in-app notices). We may assign these 
                        Terms or delegate our obligations in connection with a merger, acquisition, or sale of assets, provided your rights are 
                        not materially reduced. You may not assign your rights without our prior written consent.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        19. No Professional Advice; Template Notice
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        EchoFlux does not provide legal, tax, or financial advice. Default Fan Hub terms and privacy templates are starting 
                        points for creators and are not a substitute for advice from qualified counsel in your jurisdiction.
                    </p>

                    <div className="mt-8 p-6 border-l-4 border-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-primary-800 dark:text-primary-200">Contact Us</h4>
                        <p className="mt-2 text-primary-900 dark:text-primary-100">
                            If you have questions about these terms, contact us at <strong>contact@echoflux.ai</strong>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
