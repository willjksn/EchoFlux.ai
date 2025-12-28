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
                        <div className="flex items-start gap-3">
                            <div className="mt-1">
                                <MailIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900 dark:text-white">Support</p>
                                <a href="mailto:contact@echoflux.ai" className="text-primary-600 dark:text-primary-400 font-medium">contact@echoflux.ai</a>
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                    Fastest way to reach us. Include your account email + a screenshot if you can.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">To help us fix it faster</p>
                            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc pl-5">
                                <li>What page you were on (ex: Calendar → Edit Post)</li>
                                <li>What you clicked + what you expected</li>
                                <li>Any error text (copy/paste) + screenshot</li>
                            </ul>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Tip: You can also use the in-app <span className="font-semibold">Report a Problem</span> button for bugs.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};