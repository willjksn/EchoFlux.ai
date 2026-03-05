import React from 'react';
import { SparklesIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';

const ELITE_HIGHLIGHTS = [
  'Drops & PPV Planner (plan + price + publish)',
  'DM Session Generator (retention + PPV sequences)',
  'Funnel Teaser Packs (IG/X/TikTok teasers + CTAs)',
  'Persona Builder (voice + boundaries + brand)',
  'New Ideas (post ideas + interactive engagement)',
  'Money Calendar (drops/promos/sessions overlays)',
  'Advanced analytics + VIP insights',
];

export const PremiumStudioUpgrade: React.FC = () => {
  const { setActivePage, openPaymentModal } = useAppContext();

  const handleUpgradeToElite = () => {
    openPaymentModal({ name: 'Elite', price: 79, cycle: 'monthly' });
  };

  const handleSeeWhatIncluded = () => {
    setActivePage('pricing');
  };

  const handleNotNow = () => {
    setActivePage('dashboard');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-8 sm:p-10">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
            <SparklesIcon />
          </div>

          <h1 className="mt-6 text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-white">
            Unlock Premium Studio (Elite)
          </h1>

          <p className="mt-4 text-center text-gray-600 dark:text-gray-300 leading-relaxed">
            Premium Studio is the monetized creator workspace. It helps you plan drops, generate high-converting DM sequences, and create promo packs—so you sell more without guessing.
          </p>

          <ul className="mt-6 space-y-2">
            {ELITE_HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleUpgradeToElite}
              className="w-full py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              Upgrade to Elite
            </button>
            <button
              type="button"
              onClick={handleSeeWhatIncluded}
              className="w-full py-3 px-6 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              See what&apos;s included
            </button>
            <button
              type="button"
              onClick={handleNotNow}
              className="w-full py-2 text-gray-500 dark:text-gray-400 text-sm font-medium hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Not now
            </button>
          </div>

          <p className="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
            You can still use Fan Hub in Pro to publish, sell, and message fans. Elite adds the Studio workflows that increase conversions.
          </p>
        </div>
      </div>
    </div>
  );
};
