import axios from "axios";

// Em produção o Nginx serve o frontend e o backend na mesma origem
// (https://alexander-log.com.br/api/...), então "/api" basta. Em
// desenvolvimento local, aponte VITE_API_URL para http://localhost:4000/api.
export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gdf_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("gdf_token");
      localStorage.removeItem("gdf_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// Toda resposta de erro da API segue { error: string } ou { error: {...zod} }.
// Essa função tenta sempre devolver algo legível pro usuário final.
export function mensagemErro(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  const anyErr = err as any;
  const data = anyErr?.response?.data?.error;
  if (typeof data === "string") return data;
  if (data?.formErrors?.length) return data.formErrors.join(" ");
  if (data?.fieldErrors) {
    const primeiro = Object.values(data.fieldErrors).flat()[0];
    if (typeof primeiro === "string") return primeiro;
  }
  if (anyErr?.message === "Network Error") {
    return "Não foi possível falar com o servidor. Verifique sua internet e tente de novo.";
  }
  return fallback;
}

export interface Usuario {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "gestor_base" | "leitor" | "motorista";
  acesso_auditoria?: boolean;
  email_confirmado?: boolean;
  ativado_em?: string | null;
}
