import React, { useState, useEffect, useRef } from 'react';

interface StepAnimationProps {
  step: number;
  isActive: boolean;
  onComplete: () => void;
}

const StepAnimation: React.FC<StepAnimationProps> = ({ step, isActive, onComplete }) => {
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showClick, setShowClick] = useState(false);
  const [highlightElement, setHighlightElement] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Cursor positions for each step - adjust these based on actual screenshot layout
    // Coordinates are percentages (x: 0-100, y: 0-100) relative to the screenshot
    const steps = [
      // Step 1: Profile Setup - adjust coordinates based on actual onboarding/profile screenshot
      [
        { x: 50, y: 30, element: 'profile-button', delay: 800 },
        { x: 50, y: 45, element: 'niche-input', delay: 1500 },
        { x: 50, y: 60, element: 'audience-input', delay: 2200 },
        { x: 50, y: 75, element: 'save-button', delay: 2900 },
      ],
      // Step 2: Plan My Week - adjust coordinates based on actual Plan My Week screenshot
      [
        { x: 50, y: 25, element: 'plan-my-week', delay: 800 },
        { x: 50, y: 50, element: 'generate-button', delay: 1500 },
        { x: 50, y: 70, element: 'content-plan', delay: 2200 },
      ],
      // Step 3: Write Captions - adjust coordinates based on actual Write Captions screenshot
      [
        { x: 50, y: 25, element: 'write-captions', delay: 800 },
        { x: 50, y: 50, element: 'generate-captions', delay: 1500 },
        { x: 30, y: 70, element: 'schedule-button', delay: 2200 },
        { x: 70, y: 70, element: 'my-schedule', delay: 2900 },
      ],
    ];

    const currentStep = steps[step - 1] || [];
    const timeouts: NodeJS.Timeout[] = [];

    currentStep.forEach((action, index) => {
      // Move cursor to position
      const moveTimeout = setTimeout(() => {
        setCursorPosition({ x: action.x, y: action.y });
        setHighlightElement(action.element);
      }, action.delay);
      timeouts.push(moveTimeout);

      // Show click animation
      const clickTimeout = setTimeout(() => {
        setShowClick(true);
        setTimeout(() => {
          setShowClick(false);
        }, 400);
      }, action.delay + 400);
      timeouts.push(clickTimeout);

      // Remove highlight after click
      const removeHighlightTimeout = setTimeout(() => {
        setHighlightElement(null);
      }, action.delay + 800);
      timeouts.push(removeHighlightTimeout);
    });

    // Complete animation after last step
    const completeTimeout = setTimeout(() => {
      onComplete();
    }, (currentStep[currentStep.length - 1]?.delay || 0) + 1200);
    timeouts.push(completeTimeout);

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, [isActive, step, onComplete]);

  // Screenshot paths - update these with actual screenshot paths
  const screenshotPaths = {
    1: '/screenshots/step1-profile-setup.png', // Profile/Onboarding screenshot
    2: '/screenshots/step2-plan-my-week.png', // Plan My Week screenshot
    3: '/screenshots/step3-write-captions.png', // Write Captions screenshot
  };

  const getStepMockup = () => {
    const screenshotPath = screenshotPaths[step as keyof typeof screenshotPaths];
    
    return (
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden" style={{ minHeight: '400px' }}>
        {screenshotPath ? (
          <img
            src={screenshotPath}
            alt={`Step ${step} screenshot`}
            className="w-full h-auto object-contain"
            onError={(e) => {
              // Fallback if image doesn't exist
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          style={{ display: screenshotPath ? 'none' : 'flex' }}
        >
          <div className="text-center p-8">
            <p className="text-sm mb-2">Screenshot for Step {step}</p>
            <p className="text-xs">Place screenshot at: <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{screenshotPaths[step as keyof typeof screenshotPaths]}</code></p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {getStepMockup()}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* Highlight overlay for elements */}
          {highlightElement && (
            <div
              className="absolute border-4 border-primary-400 rounded-lg pointer-events-none transition-all duration-300"
              style={{
                boxShadow: '0 0 0 9999px rgba(37, 99, 235, 0.1)',
                animation: 'pulse-highlight 1s ease-in-out infinite',
              }}
            />
          )}
          
          {/* Animated cursor */}
          <div
            className="absolute pointer-events-none transition-all duration-500 ease-out"
            style={{
              left: `${cursorPosition.x}%`,
              top: `${cursorPosition.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-2xl"
              style={{ 
                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
              }}
            >
              <path
                d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                fill="#2563eb"
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          
          {/* Click animation */}
          {showClick && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${cursorPosition.x}%`,
                top: `${cursorPosition.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="relative">
                <div className="absolute inset-0 w-8 h-8 border-4 border-primary-500 rounded-full animate-ping opacity-75" />
                <div className="absolute inset-0 w-6 h-6 border-2 border-primary-400 rounded-full" />
                <div className="absolute inset-0 w-4 h-4 bg-primary-500 rounded-full opacity-50" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AnimatedGoLiveStepsProps {
  onScrollIntoView?: () => void;
}

export const AnimatedGoLiveSteps: React.FC<AnimatedGoLiveStepsProps> = ({ onScrollIntoView }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
            setActiveStep(1);
            if (onScrollIntoView) onScrollIntoView();
          }
        });
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [isVisible, onScrollIntoView]);

  const handleStepComplete = () => {
    if (activeStep < 3) {
      setTimeout(() => {
        setActiveStep(activeStep + 1);
      }, 500);
    } else {
      // Loop back to step 1 after a delay
      setTimeout(() => {
        setActiveStep(1);
      }, 2000);
    }
  };

  const steps = [
    {
      number: 1,
      title: 'Set Up Your Profile',
      description: 'Complete quick onboarding to tell EchoFlux.ai about your niche, audience, and goals. This helps AI generate content that matches your brand and drives results.',
    },
    {
      number: 2,
      title: 'Plan Your Content',
      description: 'Use Strategy to generate multi-week content roadmaps, or Plan My Week for quick weekly plans. Get AI-powered content ideas tailored to your niche, goals, and posting schedule.',
    },
    {
      number: 3,
      title: 'Create & Schedule',
      description: 'Generate AI captions in Write Captions and schedule everything on My Schedule. Copy your content and post manually to any platform—Instagram, TikTok, X, and more.',
    },
  ];

  return (
    <div ref={sectionRef} className="py-24 bg-gray-50 dark:bg-gray-800 overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:text-center mb-16">
          <h2 className="text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Go Live in 3 Simple Steps
          </h2>
          <p className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Watch how easy it is to get started with EchoFlux.ai
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              <div className="text-center lg:text-left mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-500 text-white text-xl font-bold mb-4">
                  {step.number}
                </div>
                <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl mb-3">
                  {step.title}
                </h3>
                <p className="text-lg text-gray-500 dark:text-gray-400">{step.description}</p>
              </div>
              
              <div className="mt-6">
                <StepAnimation
                  step={step.number}
                  isActive={isVisible && activeStep === step.number}
                  onComplete={handleStepComplete}
                />
              </div>
            </div>
          ))}
        </div>

        {isVisible && (
          <div className="mt-12 text-center">
            <button
              onClick={() => {
                setActiveStep(1);
              }}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Replay Animation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
