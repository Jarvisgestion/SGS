import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcularCumplimiento, calcularCumplimientos } from "./cumplimiento";

const HOY = new Date("2026-08-27T10:00:00");

function entrada(over: Partial<Parameters<typeof calcularCumplimiento>[0]> = {}) {
  return {
    tipoId: "t1",
    nombre: "Incendio",
    periodicidadDias: 30,
    ultimoAprobado: null,
    pendientesRevision: 0,
    ...over,
  };
}

/** Fecha a N días de HOY (negativo = pasado). */
function dias(n: number) {
  const d = new Date(HOY);
  d.setDate(d.getDate() + n);
  return d;
}

describe("calcularCumplimiento", () => {
  test("sin ejercicios aprobados queda en 'nunca', sin vencimiento calculable", () => {
    const r = calcularCumplimiento(entrada(), HOY);
    assert.equal(r.estado, "nunca");
    assert.equal(r.proximoVencimiento, null);
    assert.equal(r.diasRestantes, null);
  });

  test("un ejercicio reciente está al día", () => {
    const r = calcularCumplimiento(entrada({ ultimoAprobado: dias(-2) }), HOY);
    assert.equal(r.estado, "al_dia");
    assert.equal(r.diasRestantes, 28);
  });

  test("pasada la periodicidad queda vencido, con los días en negativo", () => {
    const r = calcularCumplimiento(entrada({ ultimoAprobado: dias(-40) }), HOY);
    assert.equal(r.estado, "vencido");
    assert.equal(r.diasRestantes, -10);
  });

  test("el aviso escala con la periodicidad: 20% del período", () => {
    // Período de 30 días -> avisa faltando 6 o menos.
    const justoEnElUmbral = calcularCumplimiento(entrada({ ultimoAprobado: dias(-24) }), HOY);
    assert.equal(justoEnElUmbral.diasRestantes, 6);
    assert.equal(justoEnElUmbral.estado, "por_vencer");

    const unDiaAntes = calcularCumplimiento(entrada({ ultimoAprobado: dias(-23) }), HOY);
    assert.equal(unDiaAntes.diasRestantes, 7);
    assert.equal(unDiaAntes.estado, "al_dia");

    // Uno anual avisa mucho antes: 20% de 365 = 73 días.
    const anual = calcularCumplimiento(
      entrada({ periodicidadDias: 365, ultimoAprobado: dias(-300) }),
      HOY
    );
    assert.equal(anual.diasRestantes, 65);
    assert.equal(anual.estado, "por_vencer");
  });

  test("el día exacto del vencimiento todavía no está vencido", () => {
    const r = calcularCumplimiento(entrada({ ultimoAprobado: dias(-30) }), HOY);
    assert.equal(r.diasRestantes, 0);
    assert.equal(r.estado, "por_vencer");
  });

  test("una periodicidad muy corta igual pasa por 'por vencer'", () => {
    // Con 20% de 3 días el umbral daría 0; se fuerza a 1 para no saltar de
    // "al día" directo a "vencido".
    const r = calcularCumplimiento(
      entrada({ periodicidadDias: 3, ultimoAprobado: dias(-2) }),
      HOY
    );
    assert.equal(r.diasRestantes, 1);
    assert.equal(r.estado, "por_vencer");
  });

  test("la hora del día no altera el conteo de días", () => {
    const mismoDiaTemprano = new Date("2026-08-27T00:05:00");
    const mismoDiaTarde = new Date("2026-08-27T23:55:00");
    const e = entrada({ ultimoAprobado: new Date("2026-08-07T18:00:00") });
    assert.equal(
      calcularCumplimiento(e, mismoDiaTemprano).diasRestantes,
      calcularCumplimiento(e, mismoDiaTarde).diasRestantes
    );
  });

  test("los ejercicios pendientes de revisión no cuentan como cumplimiento", () => {
    // Se hicieron 2 ejercicios pero tierra no los aprobó: sigue vencido.
    const r = calcularCumplimiento(
      entrada({ ultimoAprobado: dias(-40), pendientesRevision: 2 }),
      HOY
    );
    assert.equal(r.estado, "vencido");
    assert.equal(r.pendientesRevision, 2);
  });
});

describe("calcularCumplimientos (orden)", () => {
  test("ordena por urgencia: vencido, por vencer, nunca, al día", () => {
    const r = calcularCumplimientos(
      [
        entrada({ tipoId: "a", nombre: "AlDia", ultimoAprobado: dias(-1) }),
        entrada({ tipoId: "b", nombre: "Nunca" }),
        entrada({ tipoId: "c", nombre: "Vencido", ultimoAprobado: dias(-50) }),
        entrada({ tipoId: "d", nombre: "PorVencer", ultimoAprobado: dias(-26) }),
      ],
      HOY
    );
    assert.deepEqual(
      r.map((x) => x.nombre),
      ["Vencido", "PorVencer", "Nunca", "AlDia"]
    );
  });

  test("dentro del mismo estado, primero lo más urgente", () => {
    const r = calcularCumplimientos(
      [
        entrada({ tipoId: "a", nombre: "Vencido hace 5", ultimoAprobado: dias(-35) }),
        entrada({ tipoId: "b", nombre: "Vencido hace 20", ultimoAprobado: dias(-50) }),
      ],
      HOY
    );
    assert.deepEqual(
      r.map((x) => x.nombre),
      ["Vencido hace 20", "Vencido hace 5"]
    );
  });
});
