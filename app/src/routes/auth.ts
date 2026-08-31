import { Router } from 'express';
import { queryUnscoped } from '../db.js';
import { issueToken, loadUser, requireAuth, verifySecret } from '../auth.js';
import { HttpError, wrap } from '../errors.js';

export const authRouter: Router = Router();

authRouter.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) throw new HttpError(400, 'Falta email o contraseña');

  const rows = await queryUnscoped<{ id: string; password_hash: string | null; status: string }>(
    'SELECT * FROM sgs_auth_by_email($1)',
    [String(email)],
  );
  const row = rows[0];
  // Mismo mensaje para usuario inexistente y contraseña incorrecta: no se le
  // informa a quien prueba credenciales cuáles existen.
  if (!row || row.status !== 'activo' || !verifySecret(String(password), row.password_hash)) {
    throw new HttpError(401, 'Credenciales incorrectas');
  }

  const user = await loadUser(row.id);
  res.json({ token: issueToken(row.id), user });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  res.json({ user: req.user });
}));
