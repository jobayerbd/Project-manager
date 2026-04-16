import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Profile, Transaction } from '../types';
import { Users, Shield, ShieldAlert, Wallet, History, ArrowUpRight, Receipt, ArrowDownLeft } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Grant Funds Form State
  const [showGrantFunds, setShowGrantFunds] = useState(false);
  const [grantForm, setGrantForm] = useState({ userId: '', amount: '', description: 'Initial Funding' });

  useEffect(() => {
    fetchUsers();

    // Real-time Profiles
    const profilesSub = supabase
      .channel('profiles-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchUsers())
      .subscribe();

    // Real-time Transactions
    const transactionsSub = supabase
      .channel('transactions-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTransactions())
      .subscribe();

    fetchTransactions();

    return () => {
      profilesSub.unsubscribe();
      transactionsSub.unsubscribe();
    };
  }, []);

  async function fetchUsers() {
    try {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions() {
    try {
      const { data } = await supabase
        .from('transactions')
        .select(`
          *,
          from:from_id(full_name),
          to:to_id(full_name),
          project:project_id(name)
        `)
        .order('created_at', { ascending: false });
      setTransactions(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGrantFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('transactions').insert({
        from_id: profile?.id,
        to_id: grantForm.userId,
        amount: Number(grantForm.amount),
        description: grantForm.description,
        type: 'TRANSFER'
      });
      if (error) throw error;
      setShowGrantFunds(false);
      setGrantForm({ userId: '', amount: '', description: 'Initial Funding' });
      fetchTransactions();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && users.length === 0) return null;

  const pcs = users.filter(u => u.role === 'PROJECT_COORDINATOR');

  // Calculate balances for PC overview
  const getCoordinatorBalance = (userId: string) => {
    let b = 0;
    transactions.forEach(t => {
      if (t.to_id === userId) b += Number(t.amount);
      if (t.from_id === userId) b -= Number(t.amount);
    });
    return b;
  };

  const totalSystemFunds = transactions.reduce((acc, t) => {
     if (t.from_id === profile?.id && t.type === 'TRANSFER') return acc + Number(t.amount);
     return acc;
  }, 0);

  const totalSpent = transactions.reduce((acc, t) => {
     if (t.type === 'EXPENSE') return acc + Number(t.amount);
     return acc;
  }, 0);

  return (
    <div className="max-w-[1024px]">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink">Central Administration</h1>
          <p className="text-brand-muted text-sm mt-0.5">Global oversight of projects and funds</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-brand-ink">{profile?.full_name}</div>
            <div className="role-badge">ADMINISTRATOR</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-line flex items-center justify-center font-bold text-brand-muted shrink-0">
             {profile?.full_name[0]}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatsCard label="Total Released" value={formatCurrency(totalSystemFunds)} />
        <StatsCard label="Total Expenditure" value={formatCurrency(totalSpent)} accent />
        <StatsCard label="Floating Capital" value={formatCurrency(totalSystemFunds - totalSpent)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {showGrantFunds && (
            <Card className="border-brand-blue bg-white">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-ink mb-4 pb-2 border-b border-brand-line">
                 <Wallet className="w-4 h-4 text-brand-blue" /> Distribute Funds to Project Coordinator
              </div>
              <form onSubmit={handleGrantFunds} className="space-y-4">
                <select 
                  className="input-field" 
                  value={grantForm.userId}
                  onChange={e => setGrantForm({...grantForm, userId: e.target.value})}
                  required
                >
                  <option value="">Select Project Coordinator</option>
                  {pcs.map(pc => <option key={pc.id} value={pc.id}>{pc.full_name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="Amount" 
                    value={grantForm.amount}
                    onChange={e => setGrantForm({...grantForm, amount: e.target.value})}
                    required 
                  />
                  <input 
                    className="input-field" 
                    placeholder="Reference" 
                    value={grantForm.description}
                    onChange={e => setGrantForm({...grantForm, description: e.target.value})}
                    required 
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={loading} className="px-8 text-xs font-bold">Release Funds</Button>
                  <Button variant="secondary" onClick={() => setShowGrantFunds(false)} className="px-6 text-xs font-bold">Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
             <div className="px-6 py-4 flex justify-between items-center border-b border-brand-line">
                <h2 className="text-sm font-bold text-brand-ink uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> User Registry
                </h2>
                <Button variant="secondary" onClick={() => setShowGrantFunds(true)} className="py-1 px-3 text-[10px] font-extrabold border-dashed border-2">
                   GRANT FUNDS
                </Button>
             </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-line bg-brand-bg/30">
                    <th className="text-[10px] font-bold text-brand-muted uppercase tracking-wider py-4 px-6">User / Bio</th>
                    <th className="text-[10px] font-bold text-brand-muted uppercase tracking-wider py-4 px-6">System Access</th>
                    <th className="text-[10px] font-bold text-brand-muted uppercase tracking-wider py-4 px-6 text-right">Update Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-brand-bg transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white border border-brand-line flex items-center justify-center font-bold text-xs text-brand-muted shrink-0">
                            {u.full_name?.[0] || '?'}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-semibold text-brand-ink truncate">{u.full_name}</p>
                            <p className="text-[10px] text-brand-muted uppercase font-bold tracking-tight">{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                          u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'PROJECT_COORDINATOR' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-50 text-slate-500 border border-brand-line'
                        )}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <select
                          className="text-[10px] bg-white border border-brand-line rounded-md px-2 py-1 font-bold text-brand-blue hover:border-brand-blue outline-none cursor-pointer"
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as any)}
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="PROJECT_COORDINATOR">PROJ COORD</option>
                          <option value="SITE_COORDINATOR">SITE COORD</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-2 border-b border-brand-line">
               <History className="w-4 h-4 text-brand-muted" />
               <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Global System Activity</h3>
            </div>
            <div className="p-2 space-y-1">
               {transactions.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-4 group hover:bg-brand-bg transition-colors rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                          t.type === 'TRANSFER' ? "bg-blue-50 text-brand-blue" : "bg-red-50 text-red-500"
                        )}>
                          {t.type === 'TRANSFER' ? <ArrowUpRight className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                        </div>
                        <div className="overflow-hidden">
                           <p className="text-sm font-semibold text-brand-ink truncate max-w-[200px]">
                             {t.description}
                             {t.project?.name && (
                               <span className="ml-2 px-1 bg-white border border-brand-line rounded text-[9px] font-bold text-brand-muted uppercase">
                                 {t.project.name}
                               </span>
                             )}
                           </p>
                           <p className="text-[10px] text-brand-muted font-bold uppercase flex items-center gap-1.5">
                             {format(new Date(t.created_at), 'MMM dd')}
                             <span className="inline-block w-1 h-1 rounded-full bg-brand-line" />
                             {t.from?.full_name || 'System'} &rarr; {t.to?.full_name || 'Merchant'}
                           </p>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-brand-ink">{formatCurrency(t.amount)}</p>
                  </div>
               ))}
               {transactions.length === 0 && <p className="text-center py-10 text-brand-muted text-sm italic">No system activity yet.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="bg-red-50 border-red-100 p-5">
            <div className="flex items-center gap-2 text-red-700 font-bold text-[11px] uppercase tracking-widest mb-3">
              <ShieldAlert className="w-4 h-4" /> Admin Access
            </div>
            <p className="text-xs text-red-600 leading-relaxed font-medium">
              You are signed in with global privileges. Every action taken is logged for audit purposes. Use care when granting financial permissions.
            </p>
          </Card>
          
          <Card className="p-5">
            <h3 className="text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-4 pb-2 border-b border-brand-line flex items-center gap-2">
               System Health
            </h3>
            <div className="space-y-4">
              <div className="bg-brand-bg/50 p-4 rounded-lg border border-brand-line shadow-sm">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">User Onboarding</p>
                <p className="text-xs text-brand-ink leading-relaxed mb-3">
                  Provision accounts via Supabase Dashboard. New users default to <b>Site Coordinator</b>.
                </p>
                <div className="p-2 border border-brand-line rounded bg-white font-mono text-[9px] text-brand-muted">
                    AUTH {' > '} USERS {' > '} CREATE
                </div>
              </div>
              
              <div className="space-y-2 px-1">
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] text-brand-muted uppercase font-bold">Registry Size</span>
                    <span className="text-sm font-bold text-brand-ink">{users.length}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] text-brand-muted uppercase font-bold">System Status</span>
                    <div className="flex items-center gap-1.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                       <span className="text-[10px] font-bold text-green-600">OPERATIONAL</span>
                    </div>
                 </div>
              </div>

              <div className="space-y-3 pt-2">
                 <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">Coordinator Balances</p>
                 {pcs.map(pc => (
                    <div key={pc.id} className="flex justify-between items-center p-2 rounded bg-brand-bg/40 border border-brand-line/50">
                       <span className="text-xs font-bold text-brand-ink truncate max-w-[100px]">{pc.full_name}</span>
                       <span className={cn("text-xs font-bold", getCoordinatorBalance(pc.id) >= 0 ? "text-brand-ink" : "text-red-600")}>
                          {formatCurrency(getCoordinatorBalance(pc.id))}
                       </span>
                    </div>
                 ))}
                 {pcs.length === 0 && <p className="text-[10px] text-brand-muted italic">No coordinators found.</p>}
              </div>

              <Button variant="secondary" className="w-full text-[10px] font-bold h-10 border-brand-line border-2" onClick={() => window.location.reload()}>
                 REFRESH DATA
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="px-5 py-6">
      <p className="text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-2">{label}</p>
      <p className={cn("text-2xl font-bold", accent ? "text-brand-blue" : "text-brand-ink")}>{value}</p>
    </Card>
  );
}
