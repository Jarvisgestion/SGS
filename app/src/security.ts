import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './errors.js';

const produccion = process.env.NODE_ENV === 'production';

/**
 * Cabeceras de seguridad.
 *
 * La política de contenido es estricta a propósito: la aplicación no carga nada
 * de terceros. `blob:` en img-src es para las firmas dibujadas en pantalla y para
 * previsualizar un adjunto descargado; `data:` para las firmas guardadas como
 * data URL.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",   // la interfaz usa atributos style puntuales
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  if (produccion) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Redirección a HTTPS. Apagada salvo que se pida con FORCE_HTTPS=true.
 *
 * Los proveedores administrados ya sirven el dominio público por HTTPS, y sus
 * chequeos de salud llegan por http sin cabecera de proxy: redirigirlos deja el
 * despliegue en un bucle y marcado como caído. La cabecera HSTS ya cubre el lado
 * del navegador, que es donde importa.
 */
export function httpsOnly(req: Request, res: Response, next: NextFunction): void {
  const activo = process.env.FORCE_HTTPS === 'true';
  const esChequeo = req.path === '/api/health';
  if (!activo || esChequeo || req.secure || req.header('x-forwarded-proto') === 'https') {
    next();
    return;
  }
  res.redirect(308, `https://${req.header('host')}${req.originalUrl}`);
}

/**
 * Límite de intentos, en memoria.
 *
 * Alcanza para el piloto, que corre en una sola instancia. Si algún día hay más
 * de una, el contador deja de ser compartido y hay que moverlo a la base o a un
 * Redis; hasta entonces, sumar esa infraestructura sería gastar de más.
 */
export function rateLimit(opts: { ventanaMs: number; maximo: number; mensaje: string }) {
  const intentos = new Map<string, { n: number; hasta: number }>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ahora = Date.now();
    // Limpieza oportunista: sin esto el mapa crece sin techo.
    if (intentos.size > 5000) {
      for (const [k, v] of intentos) if (v.hasta <= ahora) intentos.delete(k);
    }

    const clave = req.ip ?? 'desconocido';
    const actual = intentos.get(clave);
    if (!actual || actual.hasta <= ahora) {
      intentos.set(clave, { n: 1, hasta: ahora + opts.ventanaMs });
      next();
      return;
    }

    actual.n += 1;
    if (actual.n > opts.maximo) {
      const faltan = Math.ceil((actual.hasta - ahora) / 1000);
      next(new HttpError(429, `${opts.mensaje} Probá de nuevo en ${faltan} segundos.`));
      return;
    }
    next();
  };
}
