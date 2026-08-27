import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, logout } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await logout(request.cookies.get(COOKIE_SESION)?.value);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_SESION);
  return response;
}
