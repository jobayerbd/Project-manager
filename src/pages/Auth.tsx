import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LogIn, AlertCircle, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) throw loginError;
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials' ? 'Access Denied: Incorrect email or password.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-bg">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-10">
          <div className="flex flex-col items-center">
             <div className="font-extrabold text-3xl tracking-tight text-brand-blue">EXPMANAGE</div>
             <div className="text-[10px] uppercase font-bold text-brand-muted tracking-[0.2em] mt-1">Private Enterprise System</div>
          </div>
        </div>

        <Card className="shadow-2xl p-8 border-brand-line bg-white relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-bg -mr-12 -mt-12 rounded-full opacity-50" />
          
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-brand-ink mb-1">
              Internal Login
            </h2>
            <p className="text-sm text-brand-muted mb-8">
              System access restricted to authorized personnel only.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-xs border border-red-100">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-sm font-bold mt-2" loading={loading}>
                Sign In to System
              </Button>
            </form>

            <div className="mt-8 flex items-start gap-2 p-3 bg-brand-bg/50 rounded-lg border border-brand-line">
              <Info className="w-3.5 h-3.5 text-brand-muted shrink-0 mt-0.5" />
              <p className="text-[10px] text-brand-muted leading-relaxed">
                Contact your system administrator if you have lost your credentials or require new access.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
