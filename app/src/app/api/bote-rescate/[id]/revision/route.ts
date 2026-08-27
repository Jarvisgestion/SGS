import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { revisionSchema } from "@/lib/validation";
import { boteRescateInclude } from "@/lib/boteRescate";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/bote-rescate/[id]/revision — decisión de tierra.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existente = await prisma.boteRescateControl.findUnique({ where: { id } });
  if (!existente) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (existente.estado !== "pendiente_revision") {
    return NextResponse.json(
      { error: "Solo se puede revisar un registro en estado 'pendiente_revision'" },
      { status: 409 }
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = revisionSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  await prisma.$transaction([
    prisma.boteRescateControlRevision.create({
      data: {
        controlId: id,
        decision: body.decision,
        comentario: body.comentario,
        revisadoPor: body.revisadoPor,
      },
    }),
    prisma.boteRescateControl.update({
      where: { id },
      data: { estado: body.decision },
    }),
  ]);

  const control = await prisma.boteRescateControl.findUnique({
    where: { id },
    include: boteRescateInclude,
  });

  return NextResponse.json({ data: control });
}
