import React, { useState, FormEvent } from 'react';
import { User, Session } from '@supabase/supabase-js';

export interface LoginFormProps {
  onSignIn: (email: string, password: string, rememberMe: boolean) => Promise<{
    user: User | null;
    session: Session | null;
    error: Error | null;
  }>;
  onSuccess?: (user: User, session: Session) => void;
  className?: string;
}

/**
 * Login form with "Keep me signed in" checkbox.
 * 
 * Features:
 * - Email and password inputs
 * - "Keep me signed in" checkbox (controls localStorage vs sessionStorage)
 * - Loading state during sign-in
 * - Error display
 * - Calls onSuccess after successful login
 * 
 * Usage:
 * ```tsx
 * <LoginForm
 *   onSignIn={signIn}
 *   onSuccess={(user, session) => router.push('/dashboard')}
 * />
 * ```
 */
export function LoginForm({ onSignIn, onSuccess, className }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user, session, error: signInError } = await onSignIn(email, password, rememberMe);

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (user && session) {
        onSuccess?.(user, session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px' }}>
        <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>Sign In</h2>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              background: 'var(--error-bg, #fee)',
              color: 'var(--error-color, #c33)',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label htmlFor="email" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{
              padding: '0.5rem',
              border: '1px solid var(--input-border, #ccc)',
              borderRadius: '4px',
              fontSize: '1rem',
            }}
            placeholder="you@example.com"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label htmlFor="password" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{
              padding: '0.5rem',
              border: '1px solid var(--input-border, #ccc)',
              borderRadius: '4px',
              fontSize: '1rem',
            }}
            placeholder="••••••••"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={loading}
            style={{ width: '1rem', height: '1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
          />
          <label
            htmlFor="rememberMe"
            style={{
              fontSize: '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              userSelect: 'none',
            }}
          >
            Keep me signed in
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem',
            background: loading ? 'var(--button-disabled, #999)' : 'var(--button-primary, #0070f3)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted, #666)', margin: 0 }}>
          {rememberMe
            ? 'Your session will persist across browser restarts.'
            : 'Your session will end when you close this tab.'}
        </p>
      </div>
    </form>
  );
}
