
import React from 'react';
import { AppContextType } from '../types';
import { useAuth } from './contexts/AuthContext';
import { useUI } from './contexts/UIContext';
import { useData } from './contexts/DataContext';

/**
 * This hook aggregates the modular contexts (Auth, UI, Data) into a single object.
 * This maintains backward compatibility for components that were written
 * to use the monolithic useAppContext hook.
 */
export const useAppContext = (): AppContextType => {
    const auth = useAuth();
    const ui = useUI();
    const data = useData();

    return {
        ...auth,
        ...ui,
        ...data
    } as AppContextType;
};

// AppProvider is no longer used directly as logic is split, 
// but we export a dummy or wrapper if needed. 
// In the new App.tsx, we use AuthProvider, UIProvider, and DataProvider directly.
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <>{children}</>;
};
