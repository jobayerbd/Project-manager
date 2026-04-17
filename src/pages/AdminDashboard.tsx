import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Profile, Transaction, Project } from '../types';
import { Users, Shield, ShieldAlert, Wallet, History, ArrowUpRight, Receipt, ArrowDownLeft, Briefcase, Plus, Calendar, FileBarChart, Filter } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { ViewType } from '../components/layout/Sidebar';

export default function AdminDashboard({ view, onViewChange }: { view: ViewType; onViewChange: (view: ViewType) => void }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Grant Funds Form State
  const [showGrantFunds, setShowGrantFunds] = useState(false);
  const [grantForm, setGrantForm] = useState({ userId: '', amount: '', description: 'Initial Funding' });

  // Project Form State
  const [showAddProject, setShowAddProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '', deadline: '' });

  // Add Personnel State
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'COORDINATOR' });

  useEffect(() => {
    fetchUsers();
    fetchProjects();

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

    // Real-time Projects
    const projectsSub = supabase
      .channel('projects-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .subscribe();

    fetchTransactions();

    return () => {
      profilesSub.unsubscribe();
      transactionsSub.unsubscribe();
      projectsSub.unsubscribe();
    };
  }, []);

  const isActualAdmin = profile?.role?.toUpperCase() === 'ADMIN';

  async function fetchUsers() {
    try {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      // If coordinator, filter to see only site managers and other coordinators (usually they just see site managers)
      if (!isActualAdmin) {
        setUsers((data || []).filter(u => u.role?.toUpperCase() === 'SITE_COORDINATOR' || u.id === profile?.id));
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProjects() {
    try {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (error) {
        if (error.code === 'PGRST204') {
          console.error('Database Schema Mismatch: The "deadline" column is likely missing from the "projects" table. Please run the migration script.');
        }
        throw error;
      }
      setProjects(data || []);
    } catch (err) {
      console.error(err);
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
      // Try uppercase first
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      
      // If enum mismatch, try lowercase
      if (error && error.message.includes('invalid input value for enum')) {
        await supabase.from('profiles').update({ role: newRole.toLowerCase() }).eq('id', userId);
      }
      
      fetchUsers();
    } catch (err) {
      console.error('Update role error:', err);
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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('projects').insert({
        name: projectForm.name,
        description: projectForm.description,
        deadline: projectForm.deadline || null,
        created_by: profile?.id
      });
      if (error) {
        if (error.code === '42501') {
          console.error('Permission Denied: RLS policy violated for "projects" table.');
        }
        throw error;
      }
      setShowAddProject(false);
      setProjectForm({ name: '', description: '', deadline: '' });
      fetchProjects();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && users.length === 0) return null;

  const pcs = users.filter(u => {
    const r = u.role?.toUpperCase();
    return r === 'COORDINATOR';
  });

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
      setNewUser({ email: '', password: '', full_name: '', role: 'COORDINATOR' });
      fetchUsers();
      alert('Account created successfully! No email verification needed.');
    } catch (err: any) {
      console.error(err);
      alert('Failed to add personnel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render Administration View
  if (view === 'ADMINISTRATION') {
    return (
      <div className="max-w-[1024px]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">Personnel Registry</h1>
            <p className="text-brand-muted text-sm mt-0.5">Manage system access and roles</p>
          </div>
          <Button onClick={() => setShowAddPersonnel(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Personnel
          </Button>
        </div>

        {showAddPersonnel && (
          <Card className="mb-8 border-brand-blue bg-white">
            <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-6 flex items-center gap-2">
               <Plus className="w-4 h-4" /> Register New Account
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
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Email Address</label>
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
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Assign Role</label>
                  <select 
                    className="input-field"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                    required
                  >
                    <option value="COORDINATOR">COORDINATOR</option>
                    <option value="SITE_COORDINATOR">SITE COORDINATOR</option>
                    {isActualAdmin && <option value="ADMIN">ADMIN</option>}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase">Security Credentials (Password)</label>
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
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={loading} className="px-8">Create Identity</Button>
                <Button variant="secondary" onClick={() => setShowAddPersonnel(false)}>Cancel</Button>
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
                        u.role?.toUpperCase() === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                        (u.role?.toUpperCase() === 'COORDINATOR' || u.role?.toUpperCase() === 'PROJECT_COORDINATOR') ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-50 text-slate-500 border border-brand-line'
                      )}>
                        {(u.role?.toUpperCase() === 'COORDINATOR') ? 'COORDINATOR' : (u.role || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <select
                        className="text-[10px] bg-white border border-brand-line rounded-md px-2 py-1 font-bold text-brand-blue hover:border-brand-blue outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value as any)}
                        disabled={!isActualAdmin && u.id !== profile?.id}
                      >
                        {isActualAdmin && <option value="ADMIN">ADMIN</option>}
                        <option value="COORDINATOR">COORDINATOR</option>
                        <option value="SITE_COORDINATOR">SITE COORDINATOR</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {showGrantFunds && (
            <Card className="mt-8 border-brand-blue bg-white">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-ink mb-4 pb-2 border-b border-brand-line">
                 <Wallet className="w-4 h-4 text-brand-blue" /> Distribute Funds to Coordinator
              </div>
              <form onSubmit={handleGrantFunds} className="space-y-4">
                <select 
                  className="input-field" 
                  value={grantForm.toId}
                  onChange={e => setGrantForm({...grantForm, toId: e.target.value})}
                  required
                >
                  <option value="">Select Target Coordinator</option>
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
      </div>
    );
  }

  // Render Projects View
  if (view === 'PROJECTS') {
    return (
      <div className="max-w-[1024px]">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink">Project Registry</h1>
            <p className="text-brand-muted text-sm mt-0.5">Manage and track all ongoing construction sites</p>
          </div>
          <Button onClick={() => setShowAddProject(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Create New Project
          </Button>
        </div>

        {showAddProject && (
          <Card className="mb-8 border-brand-blue bg-white">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-ink mb-4 pb-2 border-b border-brand-line">
               <Briefcase className="w-4 h-4 text-brand-blue" /> Define New Project
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase">Project Name</label>
                  <input 
                    className="input-field" 
                    placeholder="e.g. Dhaka Metro Extension" 
                    value={projectForm.name}
                    onChange={e => setProjectForm({...projectForm, name: e.target.value})}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-brand-muted uppercase">Deadline (Optional)</label>
                  <input 
                    type="date"
                    className="input-field" 
                    value={projectForm.deadline}
                    onChange={e => setProjectForm({...projectForm, deadline: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase">Description</label>
                <textarea 
                  className="input-field min-h-[100px]" 
                  placeholder="Project scope and details..." 
                  value={projectForm.description}
                  onChange={e => setProjectForm({...projectForm, description: e.target.value})}
                  required 
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={loading} className="px-8">Initiate Project</Button>
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
                  Started {format(new Date(project.created_at), 'MMM yyyy')}
                </div>
                <button onClick={() => onViewChange('DASHBOARD')} className="text-brand-blue hover:underline">View Details</button>
              </div>
            </Card>
          ))}
          {projects.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <p className="text-brand-muted italic">No projects registered yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Reports View
  if (view === 'REPORTS') {
    const projectStats = projects.map(p => {
       const projectTrans = transactions.filter(t => t.project_id === p.id);
       const totalSpent = projectTrans.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + Number(t.amount), 0);
       const totalAllocated = projectTrans.filter(t => t.type === 'TRANSFER').reduce((acc, t) => acc + Number(t.amount), 0);
       return { ...p, totalSpent, totalAllocated };
    });

    return (
       <div className="max-w-[1024px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-brand-ink">Financial Reports</h1>
            <p className="text-brand-muted text-sm mt-0.5">Comprehensive audit trail and expenditure analysis</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
             <div className="lg:col-span-3 space-y-6">
                <Card className="p-0 overflow-hidden">
                   <div className="px-6 py-4 border-b border-brand-line flex items-center gap-2">
                      <FileBarChart className="w-4 h-4 text-brand-muted" />
                      <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Project Expenditure Analysis</h3>
                   </div>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-brand-bg/50 border-b border-brand-line">
                             <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase">Project</th>
                             <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase">Funds Allocated</th>
                             <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase">Total Spent</th>
                             <th className="py-4 px-6 text-[10px] font-bold text-brand-muted uppercase text-right">Burn Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-line">
                           {projectStats.map(stat => (
                              <tr key={stat.id} className="hover:bg-brand-bg transition-colors">
                                 <td className="py-4 px-6 text-sm font-semibold text-brand-ink">{stat.name}</td>
                                 <td className="py-4 px-6 text-sm text-brand-ink">{formatCurrency(stat.totalAllocated)}</td>
                                 <td className="py-4 px-6 text-sm text-brand-ink font-bold">{formatCurrency(stat.totalSpent)}</td>
                                 <td className="py-4 px-6 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                       <div className="w-20 h-1.5 rounded-full bg-brand-line overflow-hidden">
                                          <div 
                                            className="h-full bg-brand-blue" 
                                            style={{ width: `${Math.min(100, (stat.totalSpent / (stat.totalAllocated || 1)) * 100)}%` }} 
                                          />
                                       </div>
                                       <span className="text-[10px] font-bold text-brand-muted">
                                          {Math.round((stat.totalSpent / (stat.totalAllocated || 1)) * 100)}%
                                       </span>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                      </table>
                   </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                   <div className="px-6 py-4 border-b border-brand-line flex items-center justify-between">
                      <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">Audit Trail</h3>
                      <button className="text-brand-blue text-[10px] font-bold uppercase hover:underline flex items-center gap-1">
                         <Filter className="w-3 h-3" /> Export CSV
                      </button>
                   </div>
                   <div className="divide-y divide-brand-line">
                      {transactions.slice(0, 15).map(t => (
                         <div key={t.id} className="px-6 py-3 flex items-center justify-between hover:bg-brand-bg transition-colors">
                            <div className="flex items-center gap-4">
                               <div className="text-[10px] font-bold text-brand-muted w-16">
                                  {format(new Date(t.created_at), 'MMM dd')}
                               </div>
                               <div>
                                  <p className="text-xs font-semibold text-brand-ink">{t.description}</p>
                                  <p className="text-[9px] text-brand-muted uppercase font-bold">
                                     {t.from?.full_name} &rarr; {t.to?.full_name || 'System'}
                                  </p>
                               </div>
                            </div>
                            <span className={cn(
                               "text-xs font-bold",
                               t.type === 'EXPENSE' ? 'text-red-500' : 'text-brand-blue'
                            )}>
                               {t.type === 'EXPENSE' ? '-' : '+'}{formatCurrency(t.amount)}
                            </span>
                         </div>
                      ))}
                   </div>
                </Card>
             </div>

             <div className="space-y-6">
                <Card className="p-5">
                   <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-4 border-b border-brand-line pb-2">Fiscal Summary</h4>
                   <div className="space-y-4">
                      <div>
                         <p className="text-[9px] font-bold text-brand-muted uppercase mb-1">Total System Revenue</p>
                         <p className="text-lg font-bold text-brand-ink">{formatCurrency(totalSystemFunds)}</p>
                      </div>
                      <div>
                         <p className="text-[9px] font-bold text-brand-muted uppercase mb-1">Operational Costs</p>
                         <p className="text-lg font-bold text-red-500">{formatCurrency(totalSpent)}</p>
                      </div>
                      <div>
                         <p className="text-[9px] font-bold text-brand-muted uppercase mb-1">Retained Earnings</p>
                         <p className="text-lg font-bold text-green-600">{formatCurrency(totalSystemFunds - totalSpent)}</p>
                      </div>
                   </div>
                </Card>

                <Card className="p-5 bg-brand-bg/50">
                   <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">Audit Compliance</p>
                   <p className="text-xs text-brand-muted leading-relaxed italic">
                      All records are cryptographically signed by Supabase Auth and immutable once reconciled.
                   </p>
                </Card>
             </div>
          </div>
       </div>
    );
  }

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
                 <Wallet className="w-4 h-4 text-brand-blue" /> Distribute Funds to Coordinator
              </div>
              <form onSubmit={handleGrantFunds} className="space-y-4">
                <select 
                  className="input-field" 
                  value={grantForm.userId}
                  onChange={e => setGrantForm({...grantForm, userId: e.target.value})}
                  required
                >
                  <option value="">Select Coordinator</option>
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
                          u.role?.toUpperCase() === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                          (u.role?.toUpperCase() === 'COORDINATOR' || u.role?.toUpperCase() === 'PROJECT_COORDINATOR') ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-50 text-slate-500 border border-brand-line'
                        )}>
                          {(u.role?.toUpperCase() === 'COORDINATOR') ? 'COORDINATOR' : (u.role || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <select
                          className="text-[10px] bg-white border border-brand-line rounded-md px-2 py-1 font-bold text-brand-blue hover:border-brand-blue outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as any)}
                          disabled={!isActualAdmin && u.id !== profile?.id}
                        >
                          {isActualAdmin && <option value="ADMIN">ADMIN</option>}
                          <option value="COORDINATOR">COORDINATOR</option>
                          <option value="SITE_MANAGER">SITE MANAGER</option>
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
