import React from 'react';
import { MailIcon } from './icons/UIIcons';

export const Contact: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Get in Touch</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">We'd love to hear from you! Whether you have a question, feedback, or just want to say hello.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Send us a message</h3>
                    <form className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your Name</label>
                            <input type="text" id="name" className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your Email</label>
                            <input type="email" id="email" className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" />
                        </div>
                        <div>
                            <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
                            <textarea id="message" rows={4} className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"></textarea>
                        </div>
                        <button type="submit" className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
                            Submit
                        </button>
                    </form>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact Information</h3>
                    <div className="space-y-4 text-gray-700 dark:text-gray-300">
                        <p><strong>Support:</strong> <a href="mailto:support@engagesuite.ai" className="text-primary-600 dark:text-primary-400">support@engagesuite.ai</a></p>
                        <p><strong>Sales:</strong> <a href="mailto:sales@engagesuite.ai" className="text-primary-600 dark:text-primary-400">sales@engagesuite.ai</a></p>
                        <p><strong>Address:</strong><br/>123 Innovation Drive<br/>Tech City, CA 94105</p>
                    </div>
                </div>
            </div>
        </div>
    );
};