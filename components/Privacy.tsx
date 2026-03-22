import React from 'react';

export const Privacy: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: March 2026</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        EchoFlux.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains 
                        how your personal information is collected, used, and disclosed when you use EchoFlux.ai, including our 
                        AI content tools and Fan Hub creator storefronts.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. Information We Collect</h3>
                    
                    <h4 className="font-semibold mt-4">a. Account Information</h4>
                    <p>
                        When you register for an account, we collect your name, email address, and payment information. 
                        If you sign up as a creator with Fan Hub, we also collect information necessary for Stripe Connect 
                        to process your payouts.
                    </p>

                    <h4 className="font-semibold mt-4">b. Media Content</h4>
                    <p>
                        We collect images, videos, and audio files that you upload to our platform, including content stored in 
                        My Vault, profile pictures, Fan Hub posts, and media attached to store products.
                    </p>

                    <h4 className="font-semibold mt-4">c. Fan Hub Data</h4>
                    <p>
                        If you are a creator using Fan Hub, we collect data about your storefront settings, products, posts, 
                        and member interactions. If you are a fan/member, we collect your subscription and purchase history, 
                        as well as messages you send within the platform.
                    </p>

                    <h4 className="font-semibold mt-4">d. Usage Data</h4>
                    <p>
                        We automatically collect information about how you use the service, including pages visited, features used, 
                        AI generations performed, and general analytics data.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. How We Use Your Information</h3>
                    <p>We use the information we collect to:</p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Operate, maintain, and provide the features and functionality of EchoFlux.ai</li>
                        <li>Process payments and payouts through Stripe</li>
                        <li>Display your content on your Fan Hub storefront to your members</li>
                        <li>Provide AI-generated content suggestions, captions, and strategies</li>
                        <li>Send you service-related notices and updates</li>
                        <li>Monitor and improve the service</li>
                        <li>Detect and prevent fraud, abuse, and security issues</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. Data Sent to AI Models</h3>
                    <p>
                        To provide AI-powered features, prompts you enter and (when you choose) uploaded media files may be sent 
                        to third-party AI models (such as Google's Gemini) to generate captions, hashtags, content strategies, 
                        and other suggestions.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>We do not use your data to train our own AI models.</li>
                        <li>Please refer to the privacy policies of third-party AI providers for information on how they handle data.</li>
                        <li>Trend research data (collected twice weekly via web search) is aggregated and does not contain personal information.</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Fan Hub — Creator and Member Data</h3>
                    
                    <h4 className="font-semibold mt-4">a. Creator Data</h4>
                    <p>
                        As a creator, your storefront is public at your chosen handle (echoflux.ai/&#123;handle&#125;). Your display name, 
                        bio, avatar, and public content are visible to visitors. Your email, payout details, and analytics are private.
                    </p>

                    <h4 className="font-semibold mt-4">b. Member/Fan Data</h4>
                    <p>
                        When you subscribe to or purchase from a creator, that creator can see your display name, email, 
                        and purchase history with them. Creators cannot see your activity with other creators.
                    </p>

                    <h4 className="font-semibold mt-4">c. Direct Messages</h4>
                    <p>
                        Messages between creators and fans are stored securely and are only accessible to the participants. 
                        We may review messages if reported for safety reasons or as required by law.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Payment Processing</h3>
                    <p>
                        All payments are processed by Stripe. When you make a payment or receive a payout:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Payment card details are handled directly by Stripe and are not stored on our servers.</li>
                        <li>We receive transaction information (amount, date, status) to display in your dashboard.</li>
                        <li>Stripe's privacy policy applies to payment data: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">stripe.com/privacy</a></li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Video Chat (Daily.co)</h3>
                    <p>
                        If you use the video chat feature, video sessions are powered by Daily.co:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Video streams are processed by Daily.co's servers and are not recorded or stored by EchoFlux.</li>
                        <li>We track usage minutes for billing and quota purposes.</li>
                        <li>Daily.co's privacy policy applies to video session data.</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">7. Sharing Your Information</h3>
                    <p>
                        We do not sell your personal information. We may share information in the following circumstances:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Service Providers:</strong> We share data with third-party service providers (Stripe, Firebase, 
                            Daily.co, AI providers) only as needed to provide the service.
                        </li>
                        <li>
                            <strong>Creator-Fan Relationships:</strong> Limited member information is shared with creators as 
                            described in Section 4.
                        </li>
                        <li>
                            <strong>Legal Requirements:</strong> We may disclose information if required by law, court order, 
                            or to protect the rights, property, or safety of EchoFlux, our users, or others.
                        </li>
                        <li>
                            <strong>Business Transfers:</strong> If EchoFlux is acquired or merged, user information may be 
                            transferred as part of that transaction.
                        </li>
                    </ul>
                    <p className="mt-2">
                        <strong>No selling of user data:</strong> We do not sell your personal information or user-generated 
                        content to advertisers or data brokers.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">8. Data Storage and Security</h3>
                    <p>
                        Your data is stored securely using Firebase (Google Cloud) with industry-standard encryption. 
                        Media files are stored in Firebase Storage. We implement appropriate technical and organizational 
                        measures to protect your data.
                    </p>
                    <p className="mt-2">
                        No method of transmission over the internet is 100% secure. We encourage you to use strong passwords 
                        and keep your account credentials private.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">9. Data Retention</h3>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Account data is retained as long as your account is active.</li>
                        <li>Media files remain stored until you delete them. Deleted media may take up to 30 days to be 
                            removed from backup systems.</li>
                        <li>Transaction records are retained as required for tax and legal compliance.</li>
                        <li>Messages are retained until deleted by participants or as required by our policies.</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">10. Your Rights and Choices</h3>
                    <p>You have the right to:</p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
                        <li><strong>Correction:</strong> Update or correct inaccurate information in your account settings.</li>
                        <li><strong>Deletion:</strong> Request deletion of your account and associated data.</li>
                        <li><strong>Portability:</strong> Request your data in a portable format where technically feasible.</li>
                        <li><strong>Opt-out:</strong> Unsubscribe from marketing emails using the link in any email.</li>
                    </ul>
                    <p className="mt-2">
                        To exercise these rights, contact us at <strong>contact@echoflux.ai</strong> or visit our 
                        <a href="/data-deletion" className="text-primary-600 hover:underline ml-1">Data Deletion page</a>.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">11. Cookies and Tracking</h3>
                    <p>
                        We use essential cookies to maintain your session and remember your preferences. We may use analytics 
                        tools to understand how users interact with the service. You can control cookies through your browser settings.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">12. International Users</h3>
                    <p>
                        EchoFlux.ai is operated from the United States. If you are accessing the service from outside the US, 
                        please be aware that your information may be transferred to, stored, and processed in the US where 
                        data protection laws may differ from your jurisdiction.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">13. Children's Privacy</h3>
                    <p>
                        EchoFlux.ai is not intended for users under 18 years of age. We do not knowingly collect personal 
                        information from minors. If we become aware that we have collected data from a minor, we will take 
                        steps to delete that information.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">14. Changes to This Policy</h3>
                    <p>
                        We may update this Privacy Policy from time to time. If we make changes, we will notify you by 
                        revising the "Last updated" date at the top of this policy and, in some cases, provide additional 
                        notice in the app or by email.
                    </p>
                    <p className="mt-2">
                        Continued use of the service after changes constitutes acceptance of the updated policy.
                    </p>

                    <div className="mt-8 p-6 border-l-4 border-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-primary-800 dark:text-primary-200">Questions</h4>
                        <p className="mt-2 text-primary-900 dark:text-primary-100">
                            If you have questions about privacy, data retention, or deletion, contact us at <strong>contact@echoflux.ai</strong>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
