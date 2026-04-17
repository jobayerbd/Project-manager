-- SQL Migration Script for SiteExp
-- Run these commands in your Supabase SQL Editor to ensure the database schema matches the application features.

-- 1-4. Ensure columns exist
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_common BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- 5. Helper Functions to break recursion
CREATE OR REPLACE FUNCTION is_admin() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND LOWER(role::text) = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_coordinator() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND LOWER(role::text) IN ('coordinator', 'project_coordinator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_site_manager() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND LOWER(role::text) = 'site_manager'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Profiles Policies
CREATE POLICY "Profiles are viewable by authenticated users" 
    ON profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins manage all profiles" 
    ON profiles FOR ALL USING (is_admin());

-- 9. Projects Policies
CREATE POLICY "Admins full access to projects" 
    ON projects FOR ALL USING (is_admin());

CREATE POLICY "All authenticated can view projects"
    ON projects FOR SELECT USING (auth.role() = 'authenticated');

-- 10. Transactions Policies
CREATE POLICY "Admins and Coordinators can send funds" 
    ON transactions FOR INSERT WITH CHECK (
        (is_admin() OR is_coordinator()) AND from_id = auth.uid()
    );

CREATE POLICY "Site Managers can record expenses"
    ON transactions FOR INSERT WITH CHECK (
        is_site_manager() AND from_id = auth.uid() AND type = 'EXPENSE'
    );

CREATE POLICY "Users view relevant transactions" 
    ON transactions FOR SELECT USING (
        from_id = auth.uid() OR to_id = auth.uid() OR is_admin()
    );

-- 11. Project Assignments (Allocation)
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and Coordinators manage assignments"
    ON project_assignments FOR ALL USING (is_admin() OR is_coordinator());

CREATE POLICY "Everyone view assignments"
    ON project_assignments FOR SELECT USING (auth.role() = 'authenticated');

-- Reload cache
NOTIFY pgrst, 'reload schema';
