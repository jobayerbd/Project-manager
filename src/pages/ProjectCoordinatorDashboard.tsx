import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Card, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Project, Profile, Transaction } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Plus, 
  Users, 
  Briefcase, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Receipt,
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';

export default function ProjectCoordinatorDashboard() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [scs, setScs] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSendFunds, setShowSendFunds] = useState(false);
  const [showAssignSC, setShowAssignSC] = useState(false);

  // Form states
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [newExpense, setNewExpense] = useState({ amount: '', description: '', isCommon: false, projectId: '' });
  const [newTransfer, setNewTransfer] = useState({ amount: '', toId: '', description: '' });
  const [newAssignment, setNewAssignment] = useState({ projectId: '', userId: '' });

  // Stats
  const [balance, setBalance] = useState(0);
  const [spent, setSpent] = useState(0);
  const [commonExpenses, setCommonExpenses] = useState(0);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    
    // Real-time Projects
    const projectsSub = supabase
      .channel('projects-pc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchData())
      .subscribe();

    // Real-time Transactions
    const transactionsSub = supabase
      .channel('transactions-pc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData())
      .subscribe();

    fetchData();

    return () => {
      projectsSub.unsubscribe();
      transactionsSub.unsubscribe();
    };
  }, [profile]);

  async function fetchData() {
    if (!profile) return;
    try {
      // Fetch Projects
      const { data: projData } = await supabase
        .from('projects')
        .select('*')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false });
      setProjects(projData || []);

      // Fetch SCs
      const { data: scData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'SITE_COORDINATOR');
      setScs(scData || []);

      // Fetch Transactions with Profile names
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

      // Calculate Stats
      let b = 0;
      let s = 0;
      let ce = 0;

      trans.forEach(t => {
        const amount = Number(t.amount);
        if (t.to_id === profile.id) {
          b += amount;
        }
        if (t.from_id === profile.id) {
          if (t.type === 'TRANSFER') {
            b -= amount;
          } else {
            // It's an expense
            s += amount;
            b -= amount;
            
            // If it's a common expense, it adds to the pool
            if (t.is_common) {
              ce += amount;
            }
          }
        }
        
        // If it's a distribution expense created by THIS PC, 
        // it means we've allocated common funds, so we should 
        // decrease the "unallocated" pool.
        if (t.from_id === profile.id && t.type === 'EXPENSE' && t.description?.startsWith('Common Allocation')) {
          ce -= amount;
        }
      });

      setBalance(b);
      setSpent(s);
      setCommonExpenses(Math.max(0, ce));

    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const distributeCommonExpenses = async () => {
    if (commonExpenses === 0 || projects.length === 0) {
      alert("No common expenses to distribute or no projects active.");
      return;
    }
    
    setLoading(true);
    try {
      const perProject = commonExpenses / projects.length;
      
      const distributions = projects.map(p => ({
        from_id: profile?.id,
        project_id: p.id,
        amount: perProject,
        type: 'EXPENSE',
        is_common: false,
        description: `Common Allocation`
      }));

      const { error } = await supabase.from('transactions').insert(distributions);
      if (error) throw error;
      
      // Data will refresh via onSnapshot or we call it
      fetchData();
    } catch (err) {
      console.error('Distribution error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('projects').insert({
        ...newProject,
        created_by: profile?.id
      });
      if (error) throw error;
      setShowAddProject(false);
      setNewProject({ name: '', description: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('transactions').insert({
        from_id: profile?.id,
        amount: Number(newExpense.amount),
        description: newExpense.description,
        is_common: newExpense.isCommon,
        project_id: newExpense.isCommon ? null : newExpense.projectId,
        type: 'EXPENSE'
      });
      if (error) throw error;
      setShowAddExpense(false);
      setNewExpense({ amount: '', description: '', isCommon: false, projectId: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('transactions').insert({
        from_id: profile?.id,
        to_id: newTransfer.toId,
        amount: Number(newTransfer.amount),
        description: newTransfer.description,
        type: 'TRANSFER'
      });
      if (error) throw error;
      setShowSendFunds(false);
      setNewTransfer({ amount: '', toId: '', description: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignSC = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('project_assignments').insert({
        project_id: newAssignment.projectId,
        user_id: newAssignment.userId
      });
      if (error) throw error;
      setShowAssignSC(false);
      setNewAssignment({ projectId: '', userId: '' });
      fetchData();
    } catch (err: any) {
      if (err.code === '23505') alert("Already assigned!");
      else console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1024px]">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink">Project Overview</h1>
          <p className="text-brand-muted text-sm mt-0.5">Welcome back, {profile?.full_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{profile?.full_name}</div>
            <div className="role-badge">COORDINATOR</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-line flex items-center justify-center font-bold text-brand-muted">
            {profile?.full_name[0]}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatsCard label="Available Funds" value={formatCurrency(balance)} />
        <StatsCard label="Common Pool" value={formatCurrency(commonExpenses)} accent />
        <StatsCard label="Net Balance" value={formatCurrency(balance - commonExpenses)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Content (Left) */}
        <div className="lg:col-span-2 space-y-5">
          {showAddProject && (
            <Card className="border-brand-blue bg-white">
              <CardTitle>Add New Project</CardTitle>
              <form onSubmit={handleAddProject} className="space-y-4">
                <input 
                  className="input-field" 
                  placeholder="Project Name" 
                  value={newProject.name}
                  onChange={e => setNewProject({...newProject, name: e.target.value})}
                  required 
                />
                <textarea 
                  className="input-field min-h-[100px]" 
                  placeholder="Description" 
                  value={newProject.description}
                  onChange={e => setNewProject({...newProject, description: e.target.value})}
                />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Save Project</Button>
                  <Button variant="secondary" onClick={() => setShowAddProject(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {showAddExpense && (
            <Card className="border-brand-blue bg-white">
              <CardTitle>Add Expense</CardTitle>
              <form onSubmit={handleAddExpense} className="space-y-4">
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
                  placeholder="Description" 
                  value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  required 
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-brand-line text-brand-blue focus:ring-brand-blue"
                      checked={newExpense.isCommon}
                      onChange={e => setNewExpense({...newExpense, isCommon: e.target.checked})} 
                    />
                    <span className="text-sm font-medium">Common Expense</span>
                  </label>
                  {!newExpense.isCommon && (
                    <select 
                      className="input-field py-1"
                      value={newExpense.projectId}
                      onChange={e => setNewExpense({...newExpense, projectId: e.target.value})}
                      required
                    >
                      <option value="">Select Project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Save Expense</Button>
                  <Button variant="secondary" onClick={() => setShowAddExpense(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {showSendFunds && (
            <Card className="border-brand-blue bg-white">
              <CardTitle>Send Funds to Site</CardTitle>
              <form onSubmit={handleSendFunds} className="space-y-4">
                <select 
                  className="input-field"
                  value={newTransfer.toId}
                  onChange={e => setNewTransfer({...newTransfer, toId: e.target.value})}
                  required
                >
                  <option value="">Select Site Coordinator</option>
                  {scs.map(sc => <option key={sc.id} value={sc.id}>{sc.full_name}</option>)}
                </select>
                <input 
                  type="number"
                  className="input-field" 
                  placeholder="Amount" 
                  value={newTransfer.amount}
                  onChange={e => setNewTransfer({...newTransfer, amount: e.target.value})}
                  required 
                />
                <input 
                  className="input-field" 
                  placeholder="Reference/Note" 
                  value={newTransfer.description}
                  onChange={e => setNewTransfer({...newTransfer, description: e.target.value})}
                  required 
                />
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Send Now</Button>
                  <Button variant="secondary" onClick={() => setShowSendFunds(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {showAssignSC && (
            <Card className="border-brand-blue bg-white">
              <CardTitle>Assign SC to Project</CardTitle>
              <form onSubmit={handleAssignSC} className="space-y-4">
                <select 
                  className="input-field"
                  value={newAssignment.userId}
                  onChange={e => setNewAssignment({...newAssignment, userId: e.target.value})}
                  required
                >
                  <option value="">Select Site Coordinator</option>
                  {scs.map(sc => <option key={sc.id} value={sc.id}>{sc.full_name}</option>)}
                </select>
                <select 
                  className="input-field"
                  value={newAssignment.projectId}
                  onChange={e => setNewAssignment({...newAssignment, projectId: e.target.value})}
                  required
                >
                  <option value="">Select Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button type="submit" loading={loading}>Confirm Assignment</Button>
                  <Button variant="secondary" onClick={() => setShowAssignSC(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-semibold text-brand-ink">Active Projects</h3>
              <Button variant="secondary" onClick={() => setShowAddProject(true)} className="py-1.5 px-3 text-xs">
                Add Project
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-line">
                    <th className="text-[11px] font-bold text-brand-muted uppercase tracking-wider py-3 px-1">Project Name</th>
                    <th className="text-[11px] font-bold text-brand-muted uppercase tracking-wider py-3 px-1">Coordinators</th>
                    <th className="text-[11px] font-bold text-brand-muted uppercase tracking-wider py-3 px-1 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {projects.map(p => (
                    <tr key={p.id} className="group hover:bg-brand-bg transition-colors">
                      <td className="py-3 px-1 font-medium text-sm text-brand-ink">{p.name}</td>
                      <td className="py-3 px-1 text-sm text-brand-muted">Multiple</td>
                      <td className="py-3 px-1 text-right">
                        <button className="text-brand-blue text-xs font-bold hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-brand-muted text-sm italic">No projects added yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-brand-ink mb-6">Recent Transactions</h3>
            <div className="space-y-3">
              {transactions.slice(0, 8).map(t => (
                <TransactionRow key={t.id} transaction={t} isRecipient={t.to_id === profile?.id} />
              ))}
              {transactions.length === 0 && (
                <p className="text-center text-brand-muted text-sm py-4 italic">No transaction history.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Action Sidebar (Right) */}
        <div className="space-y-5">
          <Card className="bg-accent-amber-light border-accent-amber-border p-5">
            <div className="text-[12px] font-bold text-accent-amber-text uppercase tracking-wider mb-2">
              UNALLOCATED COMMON EXPENSES
            </div>
            <div className="text-2xl font-bold text-accent-amber-text mb-2">
              {formatCurrency(commonExpenses)}
            </div>
            <p className="text-[11px] text-accent-amber mb-4">Accumulated overheads to be distributed across active projects.</p>
            <Button 
              className="w-full bg-accent-amber hover:bg-amber-600 text-white font-bold text-xs"
              onClick={distributeCommonExpenses}
              disabled={commonExpenses === 0 || projects.length === 0}
            >
              Distribute to All Projects
            </Button>
          </Card>

          <div className="space-y-3">
            <Button className="w-full text-sm font-semibold h-12" onClick={() => setShowSendFunds(true)}>
              Send Funds to SC
            </Button>
            <Button variant="secondary" className="w-full text-sm font-semibold h-12" onClick={() => setShowAddExpense(true)}>
              Quick Record Expense
            </Button>
            <Button variant="secondary" className="w-full text-sm font-semibold h-12 border-dashed" onClick={() => setShowAssignSC(true)}>
              Assign SC to Project
            </Button>
          </div>

          <Card>
            <div className="text-sm font-semibold text-brand-ink mb-4 pb-2 border-b border-brand-line">
              Recent Site Log
            </div>
            <div className="space-y-4">
              {transactions.filter(t => t.type === 'EXPENSE' && !t.is_common).slice(0, 3).map(t => (
                <div key={t.id} className="border-l-2 border-brand-line pl-3 py-0.5">
                  <p className="text-xs text-brand-muted">
                    <strong className="text-brand-ink">SC</strong> logged {formatCurrency(t.amount)} for "{t.description}"
                  </p>
                  <p className="text-[10px] text-brand-muted mt-1 uppercase font-bold">
                    {format(new Date(t.created_at), 'HH:mm')} • Site Expense
                  </p>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-xs text-brand-muted">No logs yet.</p>}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-brand-ink mb-4">Coordinators</h3>
            <div className="space-y-3">
              {scs.map(sc => (
                <div key={sc.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-bg flex items-center justify-center text-[10px] font-bold text-brand-muted">
                      {sc.full_name[0]}
                    </div>
                    <span className="text-xs font-medium text-brand-ink truncate max-w-[80px]">{sc.full_name}</span>
                  </div>
                  <button className="text-[10px] font-bold text-brand-blue uppercase hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                    Profile
                  </button>
                </div>
              ))}
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

interface TransactionRowProps {
  transaction: any;
  isRecipient: boolean;
  key?: any;
}

function TransactionRow({ transaction, isRecipient }: TransactionRowProps) {
  const isExpense = transaction.type === 'EXPENSE';
  
  return (
    <div className="flex items-center justify-between py-2.5 group">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isRecipient ? "bg-green-50 text-green-600" : isExpense ? "bg-red-50 text-red-600" : "bg-blue-50 text-brand-blue"
        )}>
          {isRecipient ? <ArrowDownLeft className="w-4 h-4" /> : isExpense ? <Receipt className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
        </div>
        <div className="overflow-hidden">
          <p className="text-sm font-semibold text-brand-ink truncate max-w-[150px]">
            {transaction.description}
            {transaction.project?.name && (
              <span className="ml-1.5 px-1 bg-brand-bg rounded text-[9px] font-bold text-brand-muted uppercase border border-brand-line">
                {transaction.project.name}
              </span>
            )}
          </p>
          <p className="text-[10px] text-brand-muted font-bold uppercase tracking-tight flex items-center gap-1.5">
            {format(new Date(transaction.created_at), 'MMM dd')}
            <span className="inline-block w-1 h-1 rounded-full bg-brand-line" />
            {isRecipient ? `From: ${transaction.from?.full_name || 'Admin'}` : isExpense ? 'Expense' : `To: ${transaction.to?.full_name}`}
          </p>
        </div>
      </div>
      <p className={cn(
        "text-sm font-bold",
        isRecipient ? "text-green-600" : isExpense ? "text-red-500" : "text-brand-ink"
      )}>
        {isRecipient ? '+' : '-'}{formatCurrency(transaction.amount)}
      </p>
    </div>
  );
}
