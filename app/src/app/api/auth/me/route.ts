import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario) return NextResponse.json({ data: null }, { status: 401 });
  return NextResponse.json({ data: usuario });
}
