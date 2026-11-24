-- Checklists vêm da VEC: visíveis apenas para superadmin/admin (como vec_veiculos).
DROP POLICY IF EXISTS checklist_select_staff ON checklist_events;
CREATE POLICY checklist_select_privileged ON checklist_events FOR SELECT USING (is_privileged_role());
