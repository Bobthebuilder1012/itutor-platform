/**
 * Example: Using the "Keep me signed in" auth system
 * 
 * This file demonstrates how to integrate the auth components into your app.
 * Copy and adapt these patterns to your actual login page and app layout.
 */

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoginForm } from '../components/LoginForm';

// Example 1: Simple login page
export function LoginPage() {
  const { signIn } = useAuth();

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <LoginForm
        onSignIn={signIn}
        onSuccess={(user) => {
          console.log('Logged in as:', user.email);
          // Redirect to dashboard
          window.location.href = '/dashboard';
        }}
      />
    </div>
  );
}

// Example 2: App with auth state
export function AppWithAuth() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div>
      <nav>
        <span>Welcome, {user.email}</span>
        <button onClick={signOut}>Logout</button>
      </nav>
      <main>
        {/* Your app content */}
      </main>
    </div>
  );
}

// Example 3: Protected route component
export function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return <>{children}</>;
}

// Example 4: Using auth in a dashboard
export function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <ProtectedPage>
      <div>
        <h1>Dashboard</h1>
        <p>Logged in as: {user?.email}</p>
        <button onClick={signOut}>Sign Out</button>
      </div>
    </ProtectedPage>
  );
}

// Example 5: Checking auth state manually
export function ManualAuthCheck() {
  const { user, session } = useAuth();

  if (!user) {
    return <div>Not authenticated</div>;
  }

  return (
    <div>
      <p>User: {user.email}</p>
      <p>Session expires: {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A'}</p>
    </div>
  );
}
