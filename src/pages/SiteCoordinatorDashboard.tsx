import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Transaction, Project } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Plus, Wallet, Receipt, AlertCircle, ArrowDownLeft } from 'lucide-react';
import { format } from 'date-fns';

export default function SiteCoordinatorDashboard() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ amount: '', description: '', projectId: '' });

  useEffect(() => {
    if (!profile) return;

    setLoading(true);

    const assignmentsSub = supabase
      .channel('assignments-sc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_assignments', filter: `user_id=eq.${profile.id}` }, () => fetchData())
      .subscribe();

    const transactionsSub = supabase
      .channel('transactions-sc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();

    fetchData();

    return () => {
      assignmentsSub.unsubscribe();
      transactionsSub.unsubscribe();
    };
  }, [profile]);

  async function fetchData() {
    if (!profile) return;
    try {
      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('projects(*)')
        .eq('user_id', profile.id);
      
      setProjects(assignments?.map(a => a.projects) || []);

      const { data: transData } = await supabase
        .from('transactions')
        .select(`
          *,
          from:from_id(full_name),
          to:to_id(full_name),
          project:project_id(name)
        `)
        .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });
      
      const trans = transData || [];
      setTransactions(trans);

      let b = 0;
      trans.forEach(t => {
        const amount = Number(t.amount);
        if (t.to_id === profile.id) b += amount;
        if (t.from_id === profile.id) b -= amount;
      });
      setBalance(b);

    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('transactions').insert({
        from_id: profile?.id,
        amount: Number(newExpense.amount),
        description: newExpense.description,
        project_id: newExpense.projectId,
        type: 'EXPENSE',
        is_common: false
      });
      if (error) throw error;
      setShowAddExpense(false);
      setNewExpense({ amount: '', description: '', projectId: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile) return null;

  return (
    <div className="max-w-[1024px]">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink">Site Overview</h1>
          <p className="text-brand-muted text-sm mt-0.5">Track your daily site expenditures</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-brand-ink">{profile?.full_name}</div>
            <div className="role-badge">SITE COORDINATOR</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-line flex items-center justify-center font-bold text-brand-muted">
             {profile?.full_name?.[0] || 'U'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatsCard label="My Balance" value={formatCurrency(balance)} accent={balance >= 0} />
        <StatsCard label="Total Projects" value={projects.length.toString()} />
        <StatsCard label="Recent Spent" value={formatCurrency(Number(transactions.filter(t => t.type === 'EXPENSE')[0]?.amount || 0))} />
      </div>

      {balance < 0 && (
         <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-700 mb-8 border-l-4">
           <AlertCircle className="w-5 h-5 flex-shrink-0" />
           <p className="text-sm font-semibold">Negative balance detected. Please reconcile with your Project Coordinator.</p>
         </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {showAddExpense && (
            <Card className="border-brand-blue bg-white">
              <h3 className="text-lg font-bold mb-4">Record New Expense</h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <select 
                  className="input-field"
                  value={newExpense.projectId}
                  onChange={e => setNewExpense({...newExpense, projectId: e.target.value})}
                  required
                >
                  <option value="">Select Related Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input 
                  type="number"
                  className="input-field" 
                  placeholder="Amount" 
                  value={newExpense.amount}
                  onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  required 
                />
                <input 
                  className="input-field" 
                  placeholder="What was this for?" 
                  value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  required 
                />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Save Expense</Button>
                  <Button variant="secondary" onClick={() => setShowAddExpense(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-brand-line flex justify-between items-center bg-white">
               <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Recent Site Expenses</h3>
               <Button onClick={() => setShowAddExpense(true)} className="py-1.5 px-3 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Record Expense
               </Button>
            </div>
            <div className="p-2 space-y-1">
               {transactions.filter(t => t.type === 'EXPENSE').map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-4 group hover:bg-brand-bg transition-colors rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
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
                             {format(new Date(t.created_at), 'MMM dd, yyyy')}
                             {t.from?.full_name && (
                               <>
                                 <span className="inline-block w-1 h-1 rounded-full bg-brand-line" />
                                 By: {t.from.full_name}
                               </>
                             )}
                           </p>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-red-500 shrink-0">-{formatCurrency(t.amount)}</p>
                  </div>
               ))}
               {transactions.length === 0 && (
                <div className="text-center py-10 text-brand-muted text-sm italic">No expenses yet.</div>
               )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
           <Card>
              <h3 className="text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-4 pb-2 border-b border-brand-line">Allocated Projects</h3>
              <div className="space-y-3">
                 {projects.map(p => (
                    <div key={p.id} className="p-3 border border-brand-line rounded-lg bg-brand-bg/30">
                       <h4 className="text-xs font-bold text-brand-ink">{p.name}</h4>
                       <div className="flex items-center gap-1.5 mt-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest">Active Site</span>
                       </div>
                    </div>
                 ))}
                 {projects.length === 0 && <p className="text-xs text-brand-muted italic">No assigned projects.</p>}
              </div>
           </Card>

           <Card>
              <h3 className="text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-4 pb-2 border-b border-brand-line">Recent Funds</h3>
              <div className="space-y-4">
                 {transactions.filter(t => t.type === 'TRANSFER' && t.to_id === profile?.id).slice(0, 3).map(t => (
                    <div key={t.id} className="flex gap-3">
                       <ArrowDownLeft className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                       <div>
                          <p className="text-xs font-semibold text-brand-ink">Received {formatCurrency(t.amount)}</p>
                          <p className="text-[10px] text-brand-muted font-bold uppercase tracking-tighter">{format(new Date(t.created_at), 'MMM dd')}</p>
                       </div>
                    </div>
                 ))}
                 {transactions.filter(t => t.type === 'TRANSFER' && t.to_id === profile?.id).length === 0 && (
                   <p className="text-xs text-brand-muted italic">No funds received recently.</p>
                 )}
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
