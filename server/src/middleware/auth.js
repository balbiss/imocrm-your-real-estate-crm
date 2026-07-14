import { supabaseAuth } from "../supabase.js";

// Valida o JWT do Supabase que o frontend manda no header Authorization e
// injeta o userId autenticado em req.userId.
export async function requireUser(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token de autenticacao ausente" });
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Token invalido ou expirado" });
  }

  req.userId = data.user.id;
  next();
}
