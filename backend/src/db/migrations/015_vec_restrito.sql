-- Dados da VEC (e BSC) são visíveis apenas para superadmin/admin.
DROP POLICY IF EXISTS vec_veiculos_select_staff ON vec_veiculos;
CREATE POLICY vec_veiculos_select_privileged ON vec_veiculos FOR SELECT USING (is_privileged_role());
