'use client';

import { useEffect, useState } from 'react';

type WelcomeHeaderProps = {
  displayName: string | null;
};

export default function WelcomeHeader({ displayName }: WelcomeHeaderProps) {
  const [greeting, setGreeting] = useState('Welcome back 👋');

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      let timeOfDay = 'morning';
      
      if (hour >= 12 && hour < 18) {
        timeOfDay = 'afternoon';
      } else if (hour >= 18 || hour < 5) {
        timeOfDay = 'evening';
      }

      const newGreeting = displayName 
        ? `Good ${timeOfDay}, ${displayName}`
        : 'Welcome back 👋';
      
      setGreeting(newGreeting);
    };

    updateGreeting();
    // Update every minute to keep it accurate
    const interval = setInterval(updateGreeting, 60000);

    return () => clearInterval(interval);
  }, [displayName]);

  return (
    <div className="mb-4">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">
        {greeting}
      </h1>
      <p className="text-lg text-gray-600">
        Ready to keep learning today?
      </p>
    </div>
  );
}

