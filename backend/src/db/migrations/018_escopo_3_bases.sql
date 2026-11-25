-- Escopo inicial do projeto: apenas as bases do administrador atual
-- (SMG3 Pouso Alegre/MG, SMG5 Poços de Caldas/MG, SMG9 Varginha/MG).
-- Dados de outras bases pertencem a outros administradores e saem desta
-- primeira etapa; voltam quando esses admins forem credenciados e vinculados.
-- Backup feito antes: /root/backups/gdf_antes_escopo3bases.sql
BEGIN;

DELETE FROM checklist_events
 WHERE coalesce(svc,'') NOT LIKE 'SMG3%'
   AND coalesce(svc,'') NOT LIKE 'SMG5%'
   AND coalesce(svc,'') NOT LIKE 'SMG9%'
    OR vehicle_id IN (SELECT id FROM vehicles WHERE base NOT IN ('SMG3','SMG5','SMG9'));

DELETE FROM telemetry_events
 WHERE vehicle_id IN (SELECT id FROM vehicles WHERE base NOT IN ('SMG3','SMG5','SMG9'));

DELETE FROM vehicles WHERE base NOT IN ('SMG3','SMG5','SMG9');

DELETE FROM vec_veiculos
 WHERE coalesce(svc,'') NOT LIKE 'SMG3%'
   AND coalesce(svc,'') NOT LIKE 'SMG5%'
   AND coalesce(svc,'') NOT LIKE 'SMG9%';

DELETE FROM fleet_snapshots WHERE base NOT IN ('SMG3','SMG5','SMG9');

DELETE FROM bases WHERE codigo NOT IN ('SMG3','SMG5','SMG9');

UPDATE bases SET ativa = true, updated_at = now() WHERE codigo IN ('SMG3','SMG5','SMG9');
UPDATE bases SET nome = 'SMG3 - Pouso Alegre',   cidade = 'Pouso Alegre',   estado = 'MG', updated_at = now() WHERE codigo = 'SMG3';
UPDATE bases SET nome = 'SMG5 - Poços de Caldas', cidade = 'Poços de Caldas', estado = 'MG', updated_at = now() WHERE codigo = 'SMG5';
UPDATE bases SET nome = 'SMG9 - Varginha',        cidade = 'Varginha',        estado = 'MG', updated_at = now() WHERE codigo = 'SMG9';

SELECT 'veiculos' AS t, count(*) FROM vehicles
UNION ALL SELECT 'vec_veiculos', count(*) FROM vec_veiculos
UNION ALL SELECT 'checklists', count(*) FROM checklist_events
UNION ALL SELECT 'bases', count(*) FROM bases
UNION ALL SELECT 'motoristas', count(*) FROM drivers;

COMMIT;
