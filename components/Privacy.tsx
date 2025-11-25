import React from 'react';

export const Privacy: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: September 3, 2024</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>EngageSuite.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by EngageSuite.ai.</p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. Information We Collect</h3>
                    <p>
                        We may collect personal information from you, such as your name, email address, payment information, and social media profile information when you register for an account and connect your social media profiles.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. How We Use Your Information</h3>
                    <p>
                        We use the information we collect to operate, maintain, and provide to you the features and functionality of the Service. This includes connecting to your social media accounts via their official APIs to retrieve messages and post replies on your behalf. We may use your email address to send you service-related notices.
                    </p>
                    
                     <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. Data Sent to AI Models & User Content</h3>
                     <h4>a. Data Sent to AI Models</h4>
                    <p>
                        To provide our core service, message content (DMs, comments) and prompts you enter are sent to third-party AI models (like Google's Gemini) to generate replies, captions, and other content. We do not use this data to train our own models. Please refer to the privacy policies of these third-party providers for more information on how they handle data.
                    </p>
                    
                    <h4>b. User-Uploaded Content (AI Avatar & Voice Clones)</h4>
                    <p>
                        Features like AI Avatar and Custom Voice Cloning require you to upload your own content (an image or audio file, respectively). This content is stored securely on our servers. We are committed to protecting this data and will only use it for the explicit purpose of generating AI content for your account as you direct. We will not use your avatar image or voice clone data to train any AI models, nor will we share it with any third parties beyond what is necessary to provide the generation service.
                    </p>
                    
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Sharing Your Information</h3>
                    <p>
                        We will not rent or sell your personal information to third parties. We may share your personal information with third-party service providers (e.g., payment processors, cloud hosting) for the purpose of providing the Service to you.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Your Choices About Your Information</h3>
                    <p>
                        You can, of course, decline to submit personal information through the Service, in which case we may not be able to provide certain services to you. You can review and correct the information about you that we keep on file by contacting us directly.
                    </p>
                    
                    <div className="mt-8 p-6 border-l-4 border-red-400 bg-red-50 dark:bg-red-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-red-800 dark:text-red-200">Disclaimer</h4>
                        <p className="mt-2 text-red-900 dark:text-red-100">
                           This is a template privacy policy and not legal advice. You should consult with a legal professional to ensure your privacy policy is compliant with all applicable laws and regulations for your specific business case.
                        </p>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">6. Changes to Our Privacy Policy</h3>
                    <p>
                        We may update this policy from time to time. If we make any changes, we will notify you by revising the "Last updated" date at the top of this policy and, in some cases, we may provide you with additional notice.
                    </p>
                </div>
            </div>
        </div>
    );
};