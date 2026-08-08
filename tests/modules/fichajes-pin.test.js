import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validarFormatoPin, estadoBloqueo, trasFallo, trasAcierto, textoEspera, FALLOS_POR_BLOQUEO } from "../../src/modules/fichajes/pin.js";

const T0 = Date.UTC(2026, 7, 8, 10, 0, 0);

describe("PIN — qué se acepta", () => {
  test("un PIN normal de 4 y de 6 dígitos vale", () => {
    assert.equal(validarFormatoPin("4917").ok, true);
    assert.equal(validarFormatoPin("508342").ok, true);
  });
  test("letras y símbolos, no", () => {
    assert.equal(validarFormatoPin("49a7").ok, false);
    assert.equal(validarFormatoPin("49 7").ok, false);
    assert.equal(validarFormatoPin("").ok, false);
  });
  test("ni tres dígitos ni siete", () => {
    assert.equal(validarFormatoPin("491").ok, false);
    assert.equal(validarFormatoPin("4917283").ok, false);
  });
  test("los PINes que prueba cualquiera se rechazan", () => {
    for (const p of ["0000", "1234", "1111", "123456", "654321", "2580", "4321"]) {
      assert.equal(validarFormatoPin(p).ok, false, `${p} debería rechazarse`);
    }
  });
  test("las series correlativas también, aunque no estén en la lista", () => {
    assert.equal(validarFormatoPin("5678").ok, false);
    assert.equal(validarFormatoPin("9876").ok, false);
    assert.equal(validarFormatoPin("345678").ok, false);
  });
  test("un número que solo empieza correlativo sí vale", () => {
    assert.equal(validarFormatoPin("1235").ok, true);
  });
  test("el mensaje explica qué hacer, no solo que está mal", () => {
    assert.match(validarFormatoPin("49a7").error, /números/);
    assert.match(validarFormatoPin("491").error, /4 y 6/);
  });
});

describe("PIN — bloqueo progresivo", () => {
  test("con el contador limpio no hay bloqueo", () => {
    assert.equal(estadoBloqueo({}, T0).bloqueado, false);
    assert.equal(estadoBloqueo({ pin_intentos: 3 }, T0).bloqueado, false);
  });

  test("los 4 primeros fallos no bloquean; el quinto sí, 60 s", () => {
    let u = {};
    for (let i = 1; i <= 4; i++) {
      const r = trasFallo(u, T0);
      assert.equal(r.bloqueado, undefined, `fallo ${i} no debe bloquear`);
      u = { ...u, ...r };
    }
    const quinto = trasFallo(u, T0);
    assert.equal(quinto.bloqueado, true);
    assert.equal(quinto.segundos, 60);
    assert.equal(quinto.pin_bloqueado_hasta, new Date(T0 + 60000).toISOString());
  });

  test("avisa cuando quedan pocos intentos", () => {
    assert.match(trasFallo({ pin_intentos: 3 }, T0).mensaje, /1 intento\b/);
    assert.match(trasFallo({ pin_intentos: 2 }, T0).mensaje, /2 intentos/);
    assert.equal(trasFallo({ pin_intentos: 0 }, T0).mensaje, "PIN incorrecto.");
  });

  test("el castigo sube: 60 s → 5 min → 30 min, y ahí se queda", () => {
    assert.equal(trasFallo({ pin_intentos: 4 }, T0).segundos, 60);
    assert.equal(trasFallo({ pin_intentos: 9 }, T0).segundos, 300);
    assert.equal(trasFallo({ pin_intentos: 14 }, T0).segundos, 1800);
    assert.equal(trasFallo({ pin_intentos: 49 }, T0).segundos, 1800, "no sube sin fin");
    assert.equal(trasFallo({ pin_intentos: 499 }, T0).segundos, 1800);
  });

  test("PROBAR 10.000 PINES CUESTA MÁS DE UN DÍA", () => {
    // El motivo de existir de todo esto. Se simula el ataque entero.
    let u = {}, reloj = T0;
    for (let i = 0; i < 10000; i++) {
      const bloqueo = estadoBloqueo(u, reloj);
      if (bloqueo.bloqueado) reloj += bloqueo.segundos * 1000;   // el atacante espera lo justo
      const r = trasFallo(u, reloj);
      u = { ...u, ...r };
      reloj += 1500;                                             // 1,5 s por teclear el PIN
    }
    const horas = (reloj - T0) / 3600000;
    assert.ok(horas > 24, `agotar el espacio de 4 dígitos cuesta ${horas.toFixed(0)} h`);
  });

  test("mientras está bloqueado se dice cuánto falta, y luego caduca solo", () => {
    const u = { pin_bloqueado_hasta: new Date(T0 + 300000).toISOString() };
    const b = estadoBloqueo(u, T0 + 60000);
    assert.equal(b.bloqueado, true);
    assert.equal(b.segundos, 240);
    assert.match(b.mensaje, /4 minutos/);
    assert.equal(estadoBloqueo(u, T0 + 300001).bloqueado, false, "caduca sin que nadie lo desbloquee");
  });

  test("una fecha corrupta en la base no deja a nadie bloqueado para siempre", () => {
    assert.equal(estadoBloqueo({ pin_bloqueado_hasta: "vete a saber" }, T0).bloqueado, false);
  });

  test("acertar borra el rastro entero", () => {
    assert.deepEqual(trasAcierto(), { pin_intentos: 0, pin_bloqueado_hasta: null });
  });
});

describe("PIN — el texto de la espera se lee bien", () => {
  test("segundos, singular y plural", () => {
    assert.equal(textoEspera(45), "45 segundos");
    assert.equal(textoEspera(60), "1 minuto");
    assert.equal(textoEspera(1800), "30 minutos");
  });
});
