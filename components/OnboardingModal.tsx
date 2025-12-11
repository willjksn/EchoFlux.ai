import React, { useState } from "react";
import { useAppContext } from "./AppContext";
import { Platform } from "../types";
import {
  InstagramIcon,
  TikTokIcon,
  ThreadsIcon,
  XIcon,
  YouTubeIcon,
  LinkedInIcon,
  FacebookIcon,
  PinterestIcon,
  DiscordIcon,
  TelegramIcon,
  RedditIcon,
} from "./icons/PlatformIcons";
import { LogoIcon } from "./icons/UIIcons";

export interface OnboardingModalProps {
  onComplete: () => void;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const { settings, setSettings } = useAppContext();

  // Safety: fallback if connectedAccounts is missing for some reason
  const connectedAccounts = settings.connectedAccounts || {
    Instagram: false,
    TikTok: false,
    X: false,
    Threads: false,
    YouTube: false,
    LinkedIn: false,
    Facebook: false,
    Pinterest: false,
    Discord: false,
    Telegram: false,
    Reddit: false,
  };

  const toggleAccountConnection = (platform: Platform) => {
    setSettings((prevSettings) => ({
      ...prevSettings,
      connectedAccounts: {
        ...connectedAccounts,
        [platform]: !connectedAccounts[platform],
      },
    }));
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="text-center">
            <div className="flex justify-center items-center text-primary-600 dark:text-primary-400 mb-4">
              <LogoIcon />
              <span className="text-2xl font-bold ml-2">EngageSuite.ai</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome to your new dashboard!
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Let's get you set up in just a couple of quick steps.
            </p>
          </div>
        );
      case 2:
        return (
          <div>
            <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
              Connect Your First Account
            </h2>
            <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
              Select which accounts you'd like to manage with EngageSuite.ai.
              You can always change this later in Settings.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.keys(connectedAccounts) as Platform[]).map(
                (platform) => (
                  <button
                    key={platform}
                    onClick={() => toggleAccountConnection(platform)}
                    className={`flex items-center p-4 rounded-lg border-2 transition-colors ${
                      connectedAccounts[platform]
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {platformIcons[platform]}
                    <span className="ml-3 font-semibold">{platform}</span>
                  </button>
                )
              )}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              You're All Set!
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Click below to start a quick tour of the app's key features.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
      aria-modal="true"
    >
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-8 flex flex-col justify-between min-h-[300px]">
        <div>{renderStepContent()}</div>
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors"
          >
            {step === 3 ? "Start Tour" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Also export default, so both import styles work
export default OnboardingModal;
