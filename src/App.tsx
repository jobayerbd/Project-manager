import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import { Sidebar, ViewType } from './components/layout/Sidebar';
import { Loader2, ShieldAlert } from 'lucide-react';
import { isConfigured } from './lib/supabase';
import { Card } from './components/ui/Card';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [activeView, setActiveView] = useState<ViewType>('DASHBOARD');

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4">
        <Card className="max-w-md w-full text-center p-8 border-brand-line">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-brand-ink mb-2">Configuration Required</h2>
          <p className="text-sm text-brand-muted mb-8 text-center px-4">
            Supabase environment variables are missing. Please add <span className="font-mono text-red-600 bg-red-50 px-1">VITE_SUPABASE_URL</span> and <span className="font-mono text-red-600 bg-red-50 px-1">VITE_SUPABASE_ANON_KEY</span> to your secrets.
          </p>
          <div className="bg-brand-bg p-4 rounded-lg text-left mb-6">
            <p className="text-[10px] uppercase font-bold text-brand-muted tracking-widest mb-2">How to fix:</p>
            <ol className="text-xs text-brand-ink space-y-2 list-decimal list-inside">
              <li>Open the <b>Secrets</b> panel in the AI Studio sidebar</li>
              <li>Add the keys from your Supabase Project Settings</li>
              <li>Refresh the page</li>
            </ol>
          </div>
          <p className="text-[10px] text-brand-muted italic">
            You can find these in your Supabase dashboard under Settings &gt; API.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-brand-bg flex">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="flex-1 ml-60 p-8 min-h-screen">
        <div className="max-w-[1024px] mx-auto">
          <Dashboard view={activeView} onViewChange={setActiveView} />
        </div>
      </main>
    </div>
  );
}
