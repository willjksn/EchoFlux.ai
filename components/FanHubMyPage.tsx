import React from "react";
import { useAppContext } from "./AppContext";
import { MyPageBuilder } from "./MyPageBuilder";

/**
 * Fan Hub → My Page: Storefront page builder with live preview.
 * Posts are managed in the dedicated Posts tab.
 */
export const FanHubMyPage: React.FC = () => {
  const { user } = useAppContext();

  if (!user?.id) {
    return (
      <div className="max-w-2xl py-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">Sign in to manage your storefront.</p>
      </div>
    );
  }

  return (
    <div>
      <MyPageBuilder />
    </div>
  );
};
