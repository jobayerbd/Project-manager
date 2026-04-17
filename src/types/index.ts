export type UserRole = 'ADMIN' | 'COORDINATOR' | 'SITE_COORDINATOR';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string | null;
  created_by: string;
  created_at: string;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  user_id: string;
  assigned_at: string;
}

export interface Transaction {
  id: string;
  from_id: string;
  to_id: string | null;
  project_id: string | null;
  amount: number;
  type: 'TRANSFER' | 'EXPENSE';
  is_common: boolean;
  description: string;
  invoice_url: string | null;
  created_at: string;
  distributed_at: string | null;
}

export interface UserBalance {
  userId: string;
  balance: number;
}
