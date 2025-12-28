import React from 'react';

export const Privacy: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: December 2025</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>EchoFlux.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by EchoFlux.ai.</p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">1. Information We Collect</h3>
                    <p>
                        We may collect personal information from you, such as your name, email address, and payment information when you
                        register for an account. We also collect media files (images and videos) that you upload to our platform, including
                        those stored in your Media Library, profile pictures, and link-in-bio images.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">2. How We Use Your Information</h3>
                    <p>
                        We use the information we collect to operate, maintain, and provide to you the features and functionality of the Service.
                        EchoFlux.ai is currently focused on planning and content creation workflows. Social platform connections, inbox syncing,
                        and automated posting/reply features may be unavailable, limited, or in testing depending on your product version.
                        We store your uploaded media files securely and use them to provide features such as caption generation, Media Library,
                        content planning, and strategy roadmaps. We may use your email address to send you service-related notices.
                    </p>
                    
                     <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">3. Data Sent to AI Models & User Content</h3>
                     <h4>a. Data Sent to AI Models</h4>
                    <p>
                        To provide our core service, prompts you enter and (when you choose) uploaded media files may be sent to third-party AI
                        models (like Google's Gemini) to generate captions, hashtags, content strategies, and other planning suggestions.
                        We do not use this data to train our own models. Please refer to the privacy policies of these third-party providers
                        for more information on how they handle data.
                    </p>
                    <p className="mt-2">
                        <strong>Weekly Trends Data:</strong> We collect and store general social media trends data on a recurring schedule
                        (currently twice weekly) using Tavily web search. This data is stored in our database and used to provide current trend
                        information to all users. This shared trend data does not contain any personal information and is used to enhance
                        AI-generated strategies and suggestions.
                    </p>
                    <p className="mt-2">
                        <strong>Tavily Web Search:</strong> EchoFlux.ai may use Tavily web search for system jobs (like the scheduled trends
                        refresh) and admin tools. End users do not currently trigger Tavily searches directly as part of strategy generation.
                        If we add user-initiated web research in the future, we will update this policy to describe what is sent and when.
                    </p>
                    
                    <h4>b. User-Uploaded Media Content</h4>
                    <p>
                        When you upload images or videos to our platform (including Media Library, profile pictures, link-in-bio images, and media for posts), this content is stored securely on our servers using Firebase Storage. We are committed to protecting this data and will only use it for the explicit purpose of providing our services to you, such as displaying media in your posts, calendar, and strategy roadmaps. We will not use your media to train any AI models, nor will we share it with any third parties beyond what is necessary to provide our services (e.g., displaying media in scheduled posts).
                    </p>
                    <p>
                        You can delete your uploaded media at any time through the Media Library or other relevant features. Deleted media will be removed from our servers, though it may take up to 30 days for complete deletion from backup systems.
                    </p>
                    
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">4. Sharing Your Information</h3>
                    <p>
                        We will not rent or sell your personal information to third parties. We do not share your personal information with other users. We may share limited information with third-party service providers (e.g., payment processors, cloud hosting, analytics) only as needed to provide the Service to you.
                    </p>
                    <p className="mt-2">
                        <strong>No selling of user data:</strong> We do not sell your personal information or user-generated content to advertisers or data brokers.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">5. Your Choices About Your Information</h3>
                    <p>
                        You can, of course, decline to submit personal information through the Service, in which case we may not be able to provide certain services to you. You can review and correct the information about you that we keep on file by contacting us directly.
                    </p>
                    
                    <div className="mt-8 p-6 border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-r-lg">
                        <h4 className="text-xl font-bold text-blue-800 dark:text-blue-200">Questions</h4>
                        <p className="mt-2 text-blue-900 dark:text-blue-100">
                           If you have questions about privacy, data retention, or deletion, contact us at <strong>contact@echoflux.ai</strong>.
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