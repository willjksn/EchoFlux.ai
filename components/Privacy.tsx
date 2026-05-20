import React from 'react';

export const Privacy: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: May 19, 2026</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        This Privacy Policy explains how <strong>EchoFlux.ai</strong> (creator studio) and <strong>witme.io</strong> (fan
                        discovery and creator pages) collect, use, and protect personal information when you use dashboards, public
                        creator pages, checkout, messaging, and related features.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. Information We Collect</h3>
                    <h4 className="font-semibold mt-4">a. Account and profile data</h4>
                    <p>
                        We collect information such as email address, display name, account identifiers, and account settings.
                        For creators, this includes payout and business details required for account operations.
                    </p>

                    <h4 className="font-semibold mt-4">b. Content and activity data</h4>
                    <p>
                        We process content you upload or send, including creator posts, media files, profile images,
                        direct messages, purchase records, and engagement events needed to run features.
                    </p>

                    <h4 className="font-semibold mt-4">c. Device and usage data</h4>
                    <p>
                        We collect technical data such as browser type, approximate location based on IP, timestamps,
                        and diagnostic logs for security and reliability. When you browse witme.io (including discovery or showcase
                        areas), we may log page views and coarse usage events to operate the site and understand traffic.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. How We Use Your Information</h3>
                    <p>We use information to:</p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Provide and maintain EchoFlux.ai (studio) and witme.io (public pages and fan experience)</li>
                        <li>Process payments and payouts through Stripe</li>
                        <li>Deliver creator page access, memberships, messages, and purchased content</li>
                        <li>Send operational notices such as receipts, security alerts, and policy updates</li>
                        <li>Detect fraud, abuse, policy violations, and security incidents</li>
                        <li>Improve performance and user experience</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. AI Features</h3>
                    <p>
                        If you use AI tools in Plan, Create Post, Fan Hub (including Post ideas and Drop plan), or the in-app assistant,
                        prompts and selected inputs may be sent to third-party model providers to return results.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Do not submit highly sensitive personal data in free-text prompts unless explicitly requested by the feature.</li>
                        <li>Third-party AI providers process data under their own terms and privacy notices.</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Fan Hub and witme Data Visibility</h3>
                    <h4 className="font-semibold mt-4">a. What creators can see</h4>
                    <p>
                        Creators can view data needed to run their witme.io pages and Fan Hub tools, such as fan display names, contact
                        details provided through purchases, and purchase history tied to their own page.
                    </p>

                    <h4 className="font-semibold mt-4">b. What creators cannot see</h4>
                    <p>
                        A creator does not get cross-creator purchase history from other creator pages.
                    </p>

                    <h4 className="font-semibold mt-4">c. Messages and reports</h4>
                    <p>
                        Messages are stored to operate messaging features. We may review relevant records when abuse or safety reports
                        are submitted, or where required by law.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Payment Processing</h3>
                    <p>
                        Payments are processed by Stripe and related payment infrastructure.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Payment card details are handled directly by Stripe and are not stored on our servers.</li>
                        <li>We receive transaction status and metadata needed for records, support, and fraud checks.</li>
                        <li>Stripe's privacy policy applies to payment data: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">stripe.com/privacy</a></li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Sharing and Service Providers</h3>
                    <p>
                        We do not sell personal information for money. We may share data with:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Cloud and infrastructure providers needed to run platform features</li>
                        <li>Payment, fraud-prevention, and security partners</li>
                        <li>Legal authorities when required by valid legal process</li>
                        <li>Successor entities in connection with merger, acquisition, or asset sale</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">7. Security and Retention</h3>
                    <p>
                        We use administrative, technical, and organizational safeguards to protect personal data.
                        No internet service is completely secure.
                    </p>
                    <p className="mt-2">
                        We retain data for as long as needed to operate services, comply with legal obligations, resolve disputes,
                        and enforce agreements.
                    </p>
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
                        <p className="font-bold">Copyright-protected creator content</p>
                        <p className="mt-2">
                            Creator images, photos, videos, messages, and paid content are COPYRIGHT PROTECTED © All rights reserved.
                            Unauthorized use, reproduction, screen recording, copying, downloading, redistribution, resale, or publication
                            is prohibited and may result in legal action, including financial damages and penalties. We will pursue civil
                            and criminal litigation against anyone infringing our clients&apos; copyrights.
                        </p>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">8. Your Rights and Choices</h3>
                    <p>You have the right to:</p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li><strong>Access and correction:</strong> Request access to or correction of your personal data.</li>
                        <li><strong>Deletion:</strong> Request account deletion, subject to legal retention requirements.</li>
                        <li><strong>Portability and objection:</strong> Where applicable, request export or object to certain processing.</li>
                        <li><strong>Marketing choices:</strong> Opt out of non-essential marketing messages.</li>
                    </ul>
                    <p className="mt-2">
                        To exercise rights, contact <strong>contact@echoflux.ai</strong> or visit our
                        <a href="/data-deletion" className="text-primary-600 hover:underline ml-1">Data Deletion page</a>.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">9. Cookies and Similar Technologies</h3>
                    <p>
                        We use cookies and similar tools for authentication, preference storage, analytics, and security.
                        Browser settings can control many cookie behaviors.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">10. International Transfers</h3>
                    <p>
                        Your information may be processed in the United States and other countries where service providers operate.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">11. Children's Privacy</h3>
                    <p>
                        Our services are not intended for minors, and we do not knowingly collect personal information from children.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">12. Changes to This Policy</h3>
                    <p>
                        We may update this policy and will revise the date above when updates are posted.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">
                        13. Platform and creator roles
                    </h3>
                    <p>
                        EchoFlux.ai handles studio operations (including Plan, Create Post, and Fan Hub configuration), security, and
                        infrastructure for creators; witme.io surfaces the public pages fans visit. Creators are responsible for
                        creator-specific practices on their pages. Where needed, we may route requests to the relevant creator.
                    </p>

                    <div className="mt-8 p-6 border-l-4 border-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-primary-800 dark:text-primary-200">Contact</h4>
                        <p className="mt-2 text-primary-900 dark:text-primary-100">
                            If you have privacy or data rights questions, contact <strong>contact@echoflux.ai</strong>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
