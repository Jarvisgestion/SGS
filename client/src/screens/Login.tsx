import { useState } from 'react';
import { api, setSession, type Session } from '../lib/api.ts';
import { mensajeDeError } from '../app.tsx';

export function Login({ onEntrar }: { onEntrar(s: Session): void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      const sesion = await api.login(email.trim(), password);
      setSession(sesion);
      onEntrar(sesion);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <main className="login">
      <div className="panel">
        <h2>Sistema de Gestión de Seguridad</h2>
        <form onSubmit={enviar}>
          <div className="campo">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="aviso error">{error}</div>}
          <button type="submit" className="boton ancho" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
