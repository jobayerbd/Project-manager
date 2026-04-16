import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { LogOut, Home, Briefcase, Users, FileText, Receipt, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Sidebar() {
  const { profile } = useAuth();
  const role = profile?.role;

  const handleLogout = () => supabase.auth.signOut();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-brand-line p-6 flex flex-col z-50">
      <div className="flex items-center gap-2 font-extrabold text-2xl tracking-tight text-brand-blue mb-10">
        EXPMANAGE
      </div>

      <div className="flex-1 flex flex-col gap-1">
        <NavItem icon={<Home className="w-4 h-4" />} label="Dashboard" active />
        
        {role === 'ADMIN' && (
          <NavItem icon={<Users className="w-4 h-4" />} label="Administration" />
        )}

        {(role === 'ADMIN' || role === 'PROJECT_COORDINATOR') && (
          <>
            <NavItem icon={<Briefcase className="w-4 h-4" />} label="All Projects" />
            <NavItem icon={<Receipt className="w-4 h-4" />} label="Common Pool" />
          </>
        )}

        {role === 'SITE_COORDINATOR' && (
          <NavItem icon={<Briefcase className="w-4 h-4" />} label="My Sites" />
        )}
        
        <NavItem icon={<FileText className="w-4 h-4" />} label="Reports" />
      </div>

      <div className="mt-auto space-y-4">
        <div className="pt-4 border-t border-brand-line">
           <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-bg flex items-center justify-center font-bold text-brand-muted shrink-0 text-sm">
                {profile?.full_name?.[0]}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[13px] font-bold truncate text-brand-ink">{profile?.full_name}</span>
                <span className="text-[10px] uppercase font-bold text-brand-muted tracking-tight">{profile?.role.replace('_', ' ')}</span>
              </div>
           </div>
           <Button variant="secondary" className="w-full justify-start gap-3 border-0 px-2 h-10 text-xs hover:bg-red-50 hover:text-red-600 transition-colors" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Logout Session
           </Button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all w-full text-left cursor-pointer",
      active ? "bg-accent-blue-light text-brand-blue font-semibold" : "text-brand-muted hover:text-brand-ink hover:bg-brand-bg"
    )}>
      {icon}
      {label}
    </button>
  );
}
