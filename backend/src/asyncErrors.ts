// Express 4 não captura erro de handler async: a requisição ficava pendurada (tela "não salva")
// e, em Node moderno, a rejeição sem tratamento derrubava o processo. Este patch envia toda
// rejeição/erro de handler para o handler central de erros (resposta 500 JSON), em todas as rotas.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require("express/lib/router/layer");

Layer.prototype.handle_request = function handle(req: unknown, res: unknown, next: (e?: unknown) => void) {
  const fn = (this as { handle: (...a: unknown[]) => unknown }).handle;
  if (fn.length > 3) return next();
  try {
    const r = fn(req, res, next) as Promise<unknown> | undefined;
    if (r && typeof r.catch === "function") r.catch(next);
  } catch (err) {
    next(err);
  }
};

process.on("unhandledRejection", (err) => {
  // eslint-disable-next-line no-console
  console.error("unhandledRejection:", err);
});
