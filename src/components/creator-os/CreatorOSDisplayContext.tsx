import React, { createContext, useContext } from "react";

export type CreatorOSDisplayContextValue = {
  showAmazonAffiliate: boolean;
  paidMemberHubLabel: string;
};

const CreatorOSDisplayContext = createContext<CreatorOSDisplayContextValue>({
  showAmazonAffiliate: false,
  paidMemberHubLabel: "Paid members",
});

export function CreatorOSDisplayProvider({
  value,
  children,
}: {
  value: CreatorOSDisplayContextValue;
  children: React.ReactNode;
}) {
  return <CreatorOSDisplayContext.Provider value={value}>{children}</CreatorOSDisplayContext.Provider>;
}

export function useCreatorOSDisplay(): CreatorOSDisplayContextValue {
  return useContext(CreatorOSDisplayContext);
}
