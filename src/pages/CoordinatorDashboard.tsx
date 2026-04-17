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
  RotateCcw,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ViewType } from '../components/layout/Sidebar';

export default function CoordinatorDashboard({ view, onViewChange }: { view: ViewType; onViewChange: (view: ViewType) => void }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [scs, setScs] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSendFunds, setShowSendFunds] = useState(false);
  const [showAssignSC, setShowAssignSC] = useState(false);
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);

  // Form states
  const [newProject, setNewProject] = useState({ name: '', description: '', deadline: '' });
  const [newExpense, setNewExpense] = useState({ amount: '', description: '', isCommon: false, projectId: '' });
  const [newTransfer, setNewTransfer] = useState({ amount: '', toId: '', description: '' });
  const [newAssignment, setNewAssignment] = useState({ projectId: '', userId: '' });
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'SITE_COORDINATOR' });

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
      // Fetch Projects created by me or where I am involved
      const { data: projData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false });
      
      if (projError) {
        if (projError.code === 'PGRST204') {
          console.error('Database Schema Mismatch: Missing "deadline" column in "projects" table.');
        }
        throw projError;
      }
      setProjects(projData || []);

      // Fetch SCs
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*');
      
      const scData = (profilesData || []).filter(u => {
        const r = u.role?.toUpperCase();
        return r === 'SITE_COORDINATOR' || r === 'COORDINATOR';
      });
      setScs(scData);

      // Fetch Transactions with Profile names
      const { data: transData, error: transError } = await supabase
        .from('transactions')
        .select(`
          *,
          from:from_id(full_name),
          to:to_id(full_name),
          project:project_id(name)
        `)
        .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });
      
      if (transError) {
        if (transError.code === 'PGRST204') {
          console.error('Database Schema Mismatch: Missing "is_common" or "project_id" in "transactions" table.');
        }
        throw transError;
      }
      
      const trans = transData || [];
      setTransactions(trans);

      // Calculate Stats
      let b = 0;
      let s = 0;
      let ce = 0;

      trans.forEach(t => {
        const amount = Number(t.amount);
        
        // Incoming funds from Admin
        if (t.to_id === profile.id) {
          b += amount;
        }

        // Outgoing funds or expenses
        if (t.from_id === profile.id) {
          if (t.type === 'TRANSFER') {
            b -= amount; // Sending to Site Manager
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
      
      fetchData();
    } catch (err) {
      console.error('Distribution error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('projects').insert({
        name: newProject.name,
        description: newProject.description,
        deadline: newProject.deadline || null,
        created_by: profile?.id
      });
      if (error) {
        if (error.code === '42501') {
          console.error('Permission Denied: RLS policy violated for "projects" table.');
        }
        throw error;
      }
      setShowAddProject(false);
      setNewProject({ name: '', description: '', deadline: '' });
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

  const handleAddPersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      
      const contentType = response.headers.get("content-type");
      if (!response.ok || !contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}`);
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      setShowAddPersonnel(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'SITE_COORDINATOR' });
      fetchData();
      alert('Personnel added successfully! They can now log in.');
    } catch (err: any) {
      console.error(err);
      alert('Failed to add personnel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render Administration (Personnel) View
  if (view === 'ADMINISTRATION') {
    return (
      <div className="max-w-[1024px]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">Personnel Registry</h1>
            <p className="text-brand-muted text-sm mt-0.5">Manage Site Managers and Coordinators</p>
          </div>
          <Button onClick={() => setShowAddPersonnel(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Personnel
          </Button>
        </div>

        {showAddPersonnel && (
          <Card className="mb-8 border-brand-blue bg-white">
            <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-6 flex items-center gap-2">
               <Plus className="w-4 h-4" /> Create New Account
            </h3>
            <form onSubmit={handleAddPersonnel} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Full Name</label>
                  <input 
                    className="input-field" 
                    placeholder="e.g. Rahul Islam" 
                    value={newUser.full_name}
                    onChange={e => setNewUser({...newUser, full_name: e.target.value})}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Email / Username</label>
                  <input 
                    type="email"
                    className="input-field" 
                    placeholder="email@example.com" 
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Role</label>
                  <select 
                    className="input-field"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                    required
                  >
                    <option value="SITE_COORDINATOR">SITE COORDINATOR</option>
                    <option value="COORDINATOR">COORDINATOR</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Initialize Password</label>
                  <input 
                    type="password"
                    className="input-field" 
                    placeholder="Min 6 characters" 
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                    required 
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={loading} className="px-8">Create Account</Button>
                <Button variant="secondary" onClick={() => setShowAddPersonnel(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-line">
                <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase tracking-wider">Full Name</th>
                <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase tracking-wider">Email</th>
                <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase tracking-wider">Position</th>
                <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase tracking-wider text-right">Access Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {scs.map(u => (
                <tr key={u.id} className="hover:bg-brand-bg/30 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-bg flex items-center justify-center text-[10px] font-bold text-brand-muted">
                        {u.full_name?.[0]}
                      </div>
                      <span className="text-sm font-bold text-brand-ink">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-xs text-brand-muted font-medium">{u.email}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight border",
                      u.role?.toUpperCase() === 'COORDINATOR' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-slate-50 text-slate-500 border-brand-line"
                    )}>
                      {u.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                     <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest">Active</span>
                  </td>
                </tr>
              ))}
              {scs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-brand-muted italic">No registered personnel found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <div className="mt-6 bg-brand-bg rounded-xl p-6 border border-brand-line border-dashed">
           <h4 className="text-xs font-bold text-brand-ink uppercase mb-2">Onboarding Guide</h4>
           <ul className="text-xs text-brand-muted space-y-2 list-disc list-inside">
              <li>New personnel must be registered via the central Auth system.</li>
              <li>Once registered, they will appear in the Admin's Global Registry.</li>
              <li>The System Admin will then assign them as a <b>Coordinator</b> or <b>Site Coordinator</b>.</li>
           </ul>
        </div>
      </div>
    );
  }

  // Render Projects View
  if (view === 'PROJECTS') {
    return (
      <div className="max-w-[1024px]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">My Project Sites</h1>
            <p className="text-brand-muted text-sm mt-0.5">Sites you have initiated and are currently managing</p>
          </div>
          <Button onClick={() => setShowAddProject(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Start Project
          </Button>
        </div>

        {showAddProject && (
          <Card className="mb-8 border-brand-blue bg-white">
            <CardTitle>Register New Site</CardTitle>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  className="input-field" 
                  placeholder="Site Name" 
                  value={newProject.name}
                  onChange={e => setNewProject({...newProject, name: e.target.value})}
                  required 
                />
                <input 
                  type="date"
                  className="input-field" 
                  value={newProject.deadline}
                  onChange={e => setNewProject({...newProject, deadline: e.target.value})}
                />
              </div>
              <textarea 
                className="input-field min-h-[100px]" 
                placeholder="Scope of work and coordinates..." 
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map(project => (
            <Card key={project.id} className="hover:border-brand-blue transition-colors group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-brand-bg flex items-center justify-center text-brand-blue shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  project.deadline ? 'bg-blue-50 text-brand-blue border border-blue-100' : 'bg-slate-50 text-slate-400 border border-brand-line'
                )}>
                  {project.deadline ? `Due: ${format(new Date(project.deadline), 'MMM dd, yyyy')}` : 'No Deadline'}
                </div>
              </div>
              <h3 className="text-lg font-bold text-brand-ink mb-2 group-hover:text-brand-blue transition-colors">{project.name}</h3>
              <p className="text-sm text-brand-muted line-clamp-3 mb-6 min-h-[60px]">{project.description}</p>
              
              <div className="pt-4 border-t border-brand-line flex justify-between items-center text-xs font-bold uppercase tracking-wider text-brand-muted">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Created {format(new Date(project.created_at), 'MMM dd, yyyy')}
                </div>
                <button onClick={() => onViewChange('DASHBOARD')} className="text-brand-blue hover:underline">Monitor Site</button>
              </div>
            </Card>
          ))}
          {projects.length === 0 && (
             <div className="col-span-full py-20 text-center text-brand-muted italic">
               You haven't initiated any project sites yet.
             </div>
          )}
        </div>
      </div>
    );
  }

  // Common Pool View
  // Render Common Pool View
  if (view === 'COMMON_POOL') {
    const commonTrans = transactions.filter(t => t.is_common && t.type === 'EXPENSE');

    return (
      <div className="max-w-[1024px]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">Common Expense Pool</h1>
            <p className="text-brand-muted text-sm mt-0.5">Manage overheads that are not site-specific</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <Card className="lg:col-span-1 bg-brand-blue text-white p-6 h-fit sticky top-8">
              <div className="flex items-center gap-2 text-[11px] font-bold opacity-80 uppercase tracking-widest mb-4">
                <Receipt className="w-4 h-4" /> Available Pool
              </div>
              <div className="text-4xl font-bold mb-6">
                 {formatCurrency(commonExpenses)}
              </div>
              <p className="text-xs opacity-80 leading-relaxed mb-8">
                Overheads like transport, office rent, or generic procurement that benefit all projects. These are distributed equally across active sites.
              </p>
              <Button 
                variant="secondary"
                className="w-full bg-white text-brand-blue hover:bg-slate-100 font-extrabold border-0 h-11"
                onClick={distributeCommonExpenses}
                disabled={commonExpenses === 0 || projects.length === 0 || loading}
              >
                Distribute to {projects.length} Sites
              </Button>
           </Card>

           <div className="lg:col-span-2 space-y-6">
             <Card>
               <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-6 flex items-center gap-2">
                 <Plus className="w-4 h-4" /> Add New Common Expense
               </h3>
               <form onSubmit={handleAddExpense} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase">Amount (BDT)</label>
                    <input 
                      type="number"
                      className="input-field" 
                      placeholder="0.00" 
                      value={newExpense.amount}
                      onChange={e => setNewExpense({...newExpense, amount: e.target.value, isCommon: true})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase">Purpose / Note</label>
                    <input 
                      className="input-field" 
                      placeholder="e.g. Office Rent, Stationery, Utility" 
                      value={newExpense.description}
                      onChange={e => setNewExpense({...newExpense, description: e.target.value, isCommon: true})}
                      required 
                    />
                  </div>
                  <Button type="submit" loading={loading} className="w-full h-11">Save to Common Pool</Button>
               </form>
             </Card>

             <Card className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-brand-line bg-white">
                   <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Unallocated Expenses</h3>
                </div>
                <div className="divide-y divide-brand-line">
                   {commonTrans.length > 0 ? commonTrans.map(t => (
                      <div key={t.id} className="px-6 py-4 hover:bg-brand-bg transition-colors">
                         <div className="flex justify-between items-center bg-transparent">
                            <div>
                               <p className="text-sm font-bold text-brand-ink">{t.description}</p>
                               <p className="text-[10px] text-brand-muted font-bold uppercase tracking-tight">{format(new Date(t.created_at), 'MMM dd, yyyy')}</p>
                            </div>
                            <span className="text-sm font-bold text-red-500">-{formatCurrency(t.amount)}</span>
                         </div>
                      </div>
                   )) : (
                      <div className="text-center py-10 text-brand-muted italic text-sm">No unallocated common expenses.</div>
                   )}
                </div>
             </Card>

             <Card className="p-0 overflow-hidden">
               <div className="px-6 py-4 border-b border-brand-line bg-white">
                  <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Historical Distributions</h3>
               </div>
               <div className="divide-y divide-brand-line">
                 {transactions.filter(t => t.description === 'Common Allocation').slice(0, 5).map(t => (
                   <div key={t.id} className="px-6 py-4 flex justify-between items-center hover:bg-brand-bg transition-colors">
                     <div className="overflow-hidden">
                       <p className="text-xs font-bold text-brand-ink truncate">{t.project?.name}</p>
                       <p className="text-[10px] text-brand-muted uppercase font-bold tracking-tight">{format(new Date(t.created_at), 'MMM dd, yyyy')}</p>
                     </div>
                     <div className="flex flex-col items-end">
                       <span className="text-sm font-bold text-brand-ink">-{formatCurrency(t.amount)}</span>
                       <span className="text-[9px] text-brand-blue font-bold uppercase">Allocated</span>
                     </div>
                   </div>
                 ))}
                 {transactions.filter(t => t.description === 'Common Allocation').length === 0 && (
                   <div className="text-center py-10 text-brand-muted text-xs italic">No prior distributions recorded.</div>
                 )}
               </div>
             </Card>
           </div>
        </div>
      </div>
    );
  }

  // Render Reports View
  if (view === 'REPORTS') {
    const projectStats = projects.map(p => {
       const projectTrans = transactions.filter(t => t.project_id === p.id);
       const totalSpent = projectTrans.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + Number(t.amount), 0);
       return { ...p, totalSpent };
    });

    return (
       <div className="max-w-[1024px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-brand-ink">Project Expenditures</h1>
            <p className="text-brand-muted text-sm mt-0.5">detailed spending analysis for your assigned sites</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
             <Card>
                <div className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-6">Site Spending Analysis</div>
                <div className="space-y-4">
                   {projectStats.map(stat => (
                      <div key={stat.id}>
                         <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-bold text-brand-ink">{stat.name}</span>
                            <span className="text-sm font-bold text-brand-ink">{formatCurrency(stat.totalSpent)}</span>
                         </div>
                         <div className="w-full h-2 bg-brand-bg rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-brand-blue" 
                              style={{ width: `${Math.min(100, (stat.totalSpent / (balance + spent || 1)) * 100)}%` }}
                            />
                         </div>
                      </div>
                   ))}
                   {projects.length === 0 && <p className="text-center py-10 text-brand-muted italic">No sites initiated.</p>}
                </div>
             </Card>

             <Card>
                <div className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-6">Expenditure Breakdown</div>
                <div className="space-y-4">
                   <div className="flex justify-between items-center p-3 rounded-lg border border-brand-line bg-brand-bg/30">
                      <span className="text-xs font-bold text-brand-muted uppercase">Common Overheads</span>
                      <span className="text-sm font-bold text-brand-ink">{formatCurrency(commonExpenses)}</span>
                   </div>
                   <div className="flex justify-between items-center p-3 rounded-lg border border-brand-line bg-brand-bg/30">
                      <span className="text-xs font-bold text-brand-muted uppercase">Direct Site Costs</span>
                      <span className="text-sm font-bold text-brand-ink">{formatCurrency(spent - commonExpenses)}</span>
                   </div>
                   <div className="pt-4 border-t border-brand-line flex justify-between items-center">
                      <span className="text-sm font-bold text-brand-ink">Total Operational Burden</span>
                      <span className="text-sm font-black text-brand-blue">{formatCurrency(spent)}</span>
                   </div>
                </div>
             </Card>
          </div>

          <Card className="p-0 overflow-hidden">
             <div className="px-6 py-4 border-b border-brand-line flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Transaction Archive</h3>
             </div>
             <div className="divide-y divide-brand-line">
                {transactions.slice(0, 20).map(t => (
                   <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-brand-bg/50 transition-colors">
                      <div className="flex items-center gap-4">
                         <div className="text-[10px] font-bold text-brand-muted w-16 uppercase">
                            {format(new Date(t.created_at), 'MMM dd')}
                         </div>
                         <div>
                            <p className="text-sm font-semibold text-brand-ink">{t.description}</p>
                            <p className="text-[10px] text-brand-muted font-bold uppercase">
                               {t.type} • {t.project?.name || 'General'}
                            </p>
                         </div>
                      </div>
                      <span className={cn(
                        "text-sm font-bold",
                        t.from_id === profile?.id ? "text-red-500" : "text-green-600"
                      )}>
                        {t.from_id === profile?.id ? '-' : '+'}{formatCurrency(t.amount)}
                      </span>
                   </div>
                ))}
             </div>
          </Card>
       </div>
    );
  }

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
          {showAddExpense && (
            <Card className="border-brand-blue bg-white">
              <CardTitle>Add Site Expense</CardTitle>
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
              <CardTitle>Send Funds to Site Manager</CardTitle>
              <form onSubmit={handleSendFunds} className="space-y-4">
                <select 
                  className="input-field"
                  value={newTransfer.toId}
                  onChange={e => setNewTransfer({...newTransfer, toId: e.target.value})}
                  required
                >
                  <option value="">Select Site Manager</option>
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
              <CardTitle>Assign Manager to Site</CardTitle>
              <form onSubmit={handleAssignSC} className="space-y-4">
                <select 
                  className="input-field"
                  value={newAssignment.userId}
                  onChange={e => setNewAssignment({...newAssignment, userId: e.target.value})}
                  required
                >
                  <option value="">Select Site Manager</option>
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
              <h3 className="text-base font-semibold text-brand-ink">My Project Sites</h3>
              <Button variant="secondary" onClick={() => onViewChange('PROJECTS')} className="py-1.5 px-3 text-xs">
                Manage Sites
              </Button>
            </div>
            
            <div className="space-y-3">
              {projects.slice(0, 3).map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-lg bg-brand-bg/40 border border-brand-line shadow-sm">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-brand-line flex items-center justify-center text-brand-muted">
                         <Briefcase className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-brand-ink">{p.name}</span>
                   </div>
                   <div className="text-[10px] uppercase font-extrabold text-brand-blue">ACTIVE</div>
                </div>
              ))}
              {projects.length === 0 && (
                <p className="text-center text-brand-muted text-sm py-4 italic">No sites initiated yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-brand-ink mb-6">Recent Activity</h3>
            <div className="space-y-3">
              {transactions.slice(0, 6).map(t => (
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
              onClick={() => onViewChange('COMMON_POOL')}
            >
              Manage & Distribute
            </Button>
          </Card>

          <div className="space-y-3">
            <Button className="w-full text-sm font-semibold h-12" onClick={() => setShowSendFunds(true)}>
              Send Funds to Manager
            </Button>
            <Button variant="secondary" className="w-full text-sm font-semibold h-12" onClick={() => setShowAddExpense(true)}>
              Record Common Expense
            </Button>
            <Button variant="secondary" className="w-full text-sm font-semibold h-12 border-dashed" onClick={() => setShowAssignSC(true)}>
              Assign Manager to Site
            </Button>
          </div>

          <Card>
            <div className="text-sm font-semibold text-brand-ink mb-4 pb-2 border-b border-brand-line">
              Site Intelligence
            </div>
            <div className="space-y-4">
              {transactions.filter(t => t.type === 'EXPENSE' && !t.is_common).slice(0, 3).map(t => (
                <div key={t.id} className="border-l-2 border-brand-line pl-3 py-0.5">
                  <p className="text-xs text-brand-muted leading-relaxed">
                    <strong className="text-brand-ink">SC</strong> logged {formatCurrency(t.amount)} for <span className="text-brand-ink font-medium">"{t.description}"</span>
                  </p>
                  <p className="text-[10px] text-brand-muted mt-1 uppercase font-bold tracking-tight">
                    {format(new Date(t.created_at), 'HH:mm')} • {t.project?.name || 'Site Expense'}
                  </p>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-xs text-brand-muted">Nothing to report yet.</p>}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-brand-ink mb-4">Site Personnel</h3>
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

interface TransactionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  transaction: any;
  isRecipient: boolean;
  className?: string;
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
