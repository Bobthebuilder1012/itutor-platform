'use client';

import { useEffect, useState } from 'react';

type WelcomeHeaderProps = {
  displayName: string | null;
};

export default function WelcomeHeader({ displayName }: WelcomeHeaderProps) {
  const [timeLabel, setTimeLabel] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours();
      let period = 'morning';
      if (hour >= 12 && hour < 18) period = 'afternoon';
      else if (hour >= 18 || hour < 5) period = 'evening';
      setTimeLabel(`Good ${period}`);
      setGreeting(displayName ? `Welcome back, ${displayName} 👋` : 'Welcome back 👋');
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [displayName]);

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-itutor-green mb-1.5">
        {timeLabel}
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
        {greeting}
      </h1>
      <p className="text-base text-gray-500 mt-1.5">Ready to keep learning today?</p>
    </div>
  );
}
