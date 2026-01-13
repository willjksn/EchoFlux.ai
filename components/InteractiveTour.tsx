import React, { useEffect, useState, useLayoutEffect } from 'react';
import { useAppContext } from './AppContext';

export const InteractiveTour: React.FC = () => {
    const { tourStep, tourSteps, nextTourStep, endTour, activePage } = useAppContext();
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    
    if (!tourSteps.length || tourStep >= tourSteps.length) {
        return null;
    }
    
    const step = tourSteps[tourStep];
    
    // Check if step requires a different page - if so, don't search for element
    const isPageMismatch = step.page && step.page !== activePage;

    useLayoutEffect(() => {
        // If page doesn't match, don't search for element
        if (isPageMismatch) {
            setTargetRect(null);
            return;
        }
        
        setTargetRect(null); // Reset on step change to show loading state
        
        let findElementPoller: number;
        let positionPoller: number;
        let attempts = 0;
        const maxAttempts = 1200; // allow more time for first step to render

        const findAndPositionElement = () => {
            const targetElement = document.getElementById(step.elementId);

            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

                // Once found, poll for a stable position
                let lastRect: DOMRect | null = null;
                let stableFrames = 0;
                const requiredStableFrames = 3;

                const checkPosition = () => {
                    const currentRect = targetElement.getBoundingClientRect();
                    if (
                        lastRect &&
                        currentRect.top === lastRect.top &&
                        currentRect.left === lastRect.left &&
                        currentRect.width === lastRect.width &&
                        currentRect.height === lastRect.height
                    ) {
                        stableFrames++;
                    } else {
                        stableFrames = 0; // Reset if position changes
                    }
                    lastRect = currentRect;

                    if (stableFrames >= requiredStableFrames) {
                        setTargetRect(currentRect); // Position is stable, update the state
                    } else {
                        positionPoller = requestAnimationFrame(checkPosition);
                    }
                };
                positionPoller = requestAnimationFrame(checkPosition);
            } else {
                attempts++;
                if (attempts > maxAttempts) {
                    console.warn(`Tour element with id "${step.elementId}" not found after ${maxAttempts} attempts. Skipping step.`);
                    // Skip to next step instead of ending tour
                    nextTourStep();
                    return;
                }
                findElementPoller = requestAnimationFrame(findAndPositionElement);
            }
        };

        findElementPoller = requestAnimationFrame(findAndPositionElement);

        return () => {
            cancelAnimationFrame(findElementPoller);
            cancelAnimationFrame(positionPoller);
        };
    }, [step.elementId, step.page, endTour, nextTourStep, isPageMismatch]);

    useEffect(() => {
        if (!targetRect) return;

        const style: React.CSSProperties = {};
        const margin = 12;
        const popoverWidth = 300;
        const popoverHeight = 160; // Approximate height for vertical calculations

        switch(step.position) {
            case 'top':
                style.top = `${targetRect.top - popoverHeight - margin}px`;
                style.left = `${targetRect.left + targetRect.width / 2 - popoverWidth / 2}px`;
                break;
            case 'right':
                style.top = `${targetRect.top + targetRect.height / 2 - popoverHeight / 2}px`;
                style.left = `${targetRect.right + margin}px`;
                break;
            case 'left':
                 style.top = `${targetRect.top + targetRect.height / 2 - popoverHeight / 2}px`;
                 style.left = `${targetRect.left - popoverWidth - margin}px`;
                 break;
            case 'bottom':
            default:
                style.top = `${targetRect.bottom + margin}px`;
                style.left = `${targetRect.left + targetRect.width / 2 - popoverWidth / 2}px`;
                break;
        }
        
        // --- Boundary Checks to keep popover on screen ---
        let left = parseInt(`${style.left}`, 10);
        if (left < margin) left = margin;
        if (left + popoverWidth > window.innerWidth - margin) left = window.innerWidth - popoverWidth - margin;
        style.left = `${left}px`;
        
        let top = parseInt(`${style.top}`, 10);
        if (top < margin) top = margin;
        if (top + popoverHeight > window.innerHeight - margin) top = window.innerHeight - popoverHeight - margin;
        style.top = `${top}px`;

        setPopoverStyle(style);
    }, [targetRect, step.position]);

    // Hide overlay if step requires a different page than current active page
    // This prevents flash when transitioning between pages
    if (isPageMismatch || !targetRect) {
        return null;
    }

    const highlighterPadding = 4;

    return (
        <div className="fixed inset-0 z-[1000] pointer-events-none">
            <div
                className="absolute bg-transparent rounded-lg transition-all duration-300 ease-in-out"
                style={{
                    top: targetRect.top - highlighterPadding,
                    left: targetRect.left - highlighterPadding,
                    width: targetRect.width + (highlighterPadding * 2),
                    height: targetRect.height + (highlighterPadding * 2),
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                }}
            />
            <div className="tour-popover pointer-events-auto" style={popoverStyle}>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{step.content}</p>
                <div className="mt-4 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{tourStep + 1} / {tourSteps.length}</span>
                    <div>
                        <button onClick={endTour} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mr-4">Skip</button>
                        <button onClick={nextTourStep} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold">
                            {tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};