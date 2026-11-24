/**
 * Roda uma sincronização da VEC na hora e mostra o resultado.
 * Uso no servidor:  docker exec gdf_api node dist/scripts/vecSync.js
 *
 * Mostra só contagens, erro (sem senha/token) e os NOMES das colunas que a
 * VEC devolveu — para conferir se o mapeamento de campos está certo.
 */
import { pool, withRole } from "../db";
import { syncVec } from "../adapters/vecAdapter";

(async () => {
  const r = await syncVec("manual");
  console.log(JSON.stringify(r, null, 2));
  if (r.ok) {
    const amostra = await withRole("superadmin", "", (c) =>
      c.query(
        `SELECT count(*)::int AS total,
                count(estado)::int AS com_estado, count(svc)::int AS com_svc,
                count(km)::int AS com_km, count(ultimo_bip)::int AS com_ultimo_bip,
                (SELECT array_agg(k) FROM (SELECT jsonb_object_keys(payload) k FROM vec_veiculos LIMIT 60) x) AS colunas_vec
         FROM vec_veiculos`
      )
    );
    console.log(JSON.stringify(amostra.rows[0], null, 2));
  }
  await pool.end();
})();
