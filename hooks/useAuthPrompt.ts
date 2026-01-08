'use client';

import { useState } from 'react';

type AuthAction = 'book' | 'message' | 'like' | 'comment' | 'post' | 'rate' | 'save';

export function useAuthPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<AuthAction>('book');
  const [redirectUrl, setRedirectUrl] = useState<string | undefined>();

  const promptAuth = (
    authAction: AuthAction,
    customRedirectUrl?: string
  ) => {
    setAction(authAction);
    setRedirectUrl(customRedirectUrl);
    setIsOpen(true);
  };

  const closePrompt = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    action,
    redirectUrl,
    promptAuth,
    closePrompt,
  };
}

