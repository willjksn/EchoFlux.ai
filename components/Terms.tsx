import React from 'react';

export const Terms: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: March 30, 2026</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        These Terms govern your use of EchoFlux.ai and witme.io, including creator tools, fan-facing creator pages,
                        messaging, subscriptions, paid content, tips, sessions, and related checkout flows. By using the service,
                        you agree to these Terms.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. Eligibility</h3>
                    <p>
                        You must be at least 18 years old to create an account or make purchases. By using the platform,
                        you confirm you are legally able to enter into a binding agreement.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. Platform Structure</h3>
                    <p>
                        EchoFlux.ai is the creator operating platform. witme.io is the fan-facing destination where creator pages live.
                        Creator pages may include memberships, paid posts, store items, direct messages, tips, and session offers.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Creator access:</strong> Creator accounts are tied to EchoFlux subscriptions. There is no separate
                            creator application required through witme.io.
                        </li>
                        <li>
                            <strong>Fan access:</strong> Fans can browse creator pages and purchase whatever a creator enables on their page.
                        </li>
                        <li>
                            <strong>Feature variability:</strong> Not every creator page has the same offerings.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. Payments, Billing, and Refunds</h3>
                    <p>
                        Payments are processed by Stripe and related providers. By purchasing, you authorize the applicable charges,
                        including recurring charges for memberships until canceled.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Creator subscriptions:</strong> EchoFlux subscription fees are billed based on your selected plan.
                        </li>
                        <li>
                            <strong>Fan purchases:</strong> Memberships and paid content are charged at checkout pricing shown at the time of purchase.
                        </li>
                        <li>
                            <strong>Refunds:</strong> Digital access is generally final unless required by law or otherwise stated at checkout.
                            For creator-page purchases, the creator controls the offer and delivery; platform-level rules and applicable law still apply.
                        </li>
                        <li>
                            <strong>Charge disputes:</strong> If you believe a charge is unauthorized, contact support promptly so we can review.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Creator Responsibilities</h3>
                    <p>
                        Creators are responsible for their page settings, offer details, posted content, pricing, and fan communications.
                        Creators must comply with applicable laws (including consumer, tax, and intellectual property laws).
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Fan Responsibilities</h3>
                    <p>
                        Fans must use creator pages respectfully and lawfully. You may not harass users, evade blocks, or attempt fraud.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>
                            <strong>Personal-use access only:</strong> Content and messages are for your own viewing and participation on-platform.
                        </li>
                        <li>
                            <strong>No unauthorized reuse:</strong> Do not copy, screen-record, redistribute, scrape, or republish creator content
                            without permission.
                        </li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Content and Conduct Guidelines</h3>
                    <p>
                        We maintain a brand-safe environment. The following are prohibited across EchoFlux and witme:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-2">
                        <li>Any exploitation or sexual content involving minors</li>
                        <li>Non-consensual sexual content or extortion</li>
                        <li>Content that promotes violence, hate speech, or discrimination</li>
                        <li>Illegal goods, unlawful services, scams, or deceptive conduct</li>
                        <li>Infringement of copyright, trademark, or privacy rights</li>
                        <li>Impersonation, deceptive deepfakes, or manipulated identity content</li>
                        <li>Spam, fake engagement schemes, or repeated unwanted contact</li>
                    </ul>
                    <p className="mt-4">We may remove content, limit features, or suspend accounts for violations.</p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">7. Messaging and Sessions</h3>
                    <p>
                        Creators may use assistants or team members to help manage responses. We do not guarantee response times,
                        response quality, or availability of any specific creator interaction feature.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">8. Intellectual Property</h3>
                    <p>
                        EchoFlux software and branding are owned by EchoFlux. Creators and users keep ownership of their own submitted content,
                        while granting the limited rights needed to operate the platform.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">9. Availability and Liability</h3>
                    <p>
                        The service is provided as-is and as-available. To the fullest extent allowed by law, EchoFlux is not liable for
                        indirect, incidental, or consequential damages, or for disputes between creators and fans regarding creator-specific
                        offers, content, or conduct.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">10. Suspension and Termination</h3>
                    <p>
                        We may suspend, restrict, or terminate access for legal, security, abuse, payment, or policy reasons.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">11. Changes to Terms</h3>
                    <p>
                        We may update these Terms from time to time. If we do, we will update the date shown above.
                        Continued use after changes means you accept the updated Terms.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">12. Contact</h3>
                    <p>
                        Questions about these Terms can be sent to <strong>contact@echoflux.ai</strong>.
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
