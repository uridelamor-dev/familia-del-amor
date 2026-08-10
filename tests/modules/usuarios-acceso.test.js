import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  passwordInicial, validarPassword, esperaTrasFallo, estadoFreno, trasFalloLogin,
  trasLoginCorrecto, textoEspera, ESPERAS_SEG, FALLOS_ANTES_DE_FRENAR,
} from "../../src/modules/usuarios/acceso.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const T0 = Date.UTC(2026, 7, 8, 10, 0, 0);

describe("acceso — la contraseña inicial", () => {
  test("es el propio nombre de usuario", () => {
    assert.equal(passwordInicial("ana.blanes"), "ana.blanes");
    assert.equal(passwordInicial("  ana.blanes  "), "ana.blanes");
  });
});

describe("acceso — qué se acepta al cambiarla", () => {
  test("NO puede ser igual que el usuario: es justo la que hay que cambiar", () => {
    const r = validarPassword("ana.blanes", { username: "ana.blanes" });
    assert.equal(r.ok, false);
    assert.match(r.error, /igual que tu usuario/);
  });
  test("ni cambiando mayúsculas", () => {
    assert.equal(validarPassword("Ana.Blanes", { username: "ana.blanes" }).ok, false);
  });
  test("tiene que tener cuerpo", () => {
    assert.equal(validarPassword("abc", { username: "ana" }).ok, false);
    assert.match(validarPassword("abc", { username: "ana" }).error, /6 caracteres/);
  });
  test("no vale solo espacios", () => {
    assert.equal(validarPassword("        ", { username: "ana" }).ok, false);
  });
  test("una normal sí vale, sin exigir símbolos raros", () => {
    // Exigir mayúscula+número+símbolo acaba en post-its pegados a la caja.
    assert.equal(validarPassword("melocoton", { username: "ana" }).ok, true);
    assert.equal(validarPassword("la tapeta 2026", { username: "ana" }).ok, true);
  });
});

describe("acceso — el freno tras fallar", () => {
  test("los primeros intentos no cuestan nada: la gente se equivoca", () => {
    for (let i = 1; i < FALLOS_ANTES_DE_FRENAR; i++) assert.equal(esperaTrasFallo(i), 0, `el intento ${i}`);
  });

  test("a partir del quinto empieza a costar, y sube", () => {
    assert.equal(esperaTrasFallo(5), ESPERAS_SEG[0]);
    assert.equal(esperaTrasFallo(6), ESPERAS_SEG[1]);
    assert.equal(esperaTrasFallo(7), ESPERAS_SEG[2]);
    assert.equal(esperaTrasFallo(8), ESPERAS_SEG[3]);
  });

  test("PERO NO SUBE SIN FIN: nadie puede dejar fuera a la dirección a propósito", () => {
    // Con un bloqueo permanente por usuario, cualquiera que sepa un nombre de usuario
    // podría dejar a esa persona sin poder entrar simplemente fallando aposta.
    assert.equal(esperaTrasFallo(50), ESPERAS_SEG[ESPERAS_SEG.length - 1]);
    assert.equal(esperaTrasFallo(5000), ESPERAS_SEG[ESPERAS_SEG.length - 1]);
    assert.ok(ESPERAS_SEG[ESPERAS_SEG.length - 1] <= 900, "el tope no pasa de un cuarto de hora");
  });

  test("PROBAR UN DICCIONARIO SE VUELVE INVIABLE", () => {
    let u = {}, reloj = T0;
    for (let i = 0; i < 1000; i++) {
      const f = estadoFreno(u, reloj);
      if (f.frenado) reloj += f.segundos * 1000;
      const r = trasFalloLogin(u, reloj);
      u = { ...u, ...r };
      reloj += 500;
    }
    const horas = (reloj - T0) / 3600000;
    assert.ok(horas > 200, `mil intentos cuestan ${horas.toFixed(0)} h`);
  });

  test("mientras está frenado se dice cuánto falta, y caduca solo", () => {
    const u = { login_bloqueado_hasta: new Date(T0 + 120000).toISOString() };
    assert.equal(estadoFreno(u, T0).frenado, true);
    assert.match(estadoFreno(u, T0).mensaje, /2 minutos/);
    assert.equal(estadoFreno(u, T0 + 120001).frenado, false);
  });

  test("una fecha corrupta no deja a nadie fuera para siempre", () => {
    assert.equal(estadoFreno({ login_bloqueado_hasta: "vete a saber" }, T0).frenado, false);
  });

  test("entrar bien borra el rastro", () => {
    assert.deepEqual(trasLoginCorrecto(), { login_intentos: 0, login_bloqueado_hasta: null });
  });

  test("el texto de la espera se lee bien", () => {
    assert.equal(textoEspera(30), "30 segundos");
    assert.equal(textoEspera(60), "1 minuto");
    assert.equal(textoEspera(900), "15 minutos");
  });
});

describe("acceso — la contraseña sin estrenar avisa, pero no cierra la puerta", () => {
  // Se probó a bloquear el panel hasta cambiarla y el resultado fue gente sin poder trabajar
  // por un formulario. Ahora la marca solo sirve para avisar (y para que dirección vea qué
  // cuentas siguen con la contraseña que les dieron).
  test("ya no hay lista de rutas permitidas: no hay nada que permitir", async () => {
    const mod = await import("../../src/modules/usuarios/acceso.js");
    assert.equal(mod.puedeConPasswordTemporal, undefined);
    assert.equal(mod.RUTAS_CON_PASSWORD_TEMPORAL, undefined);
  });
});

describe("acceso — cableado en el servidor", () => {
  const server = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");

  test("requireAuth ya NO corta el paso por la contraseña temporal", () => {
    // Cortar aquí dejaba fuera del panel a quien abre el local a las siete de la mañana.
    const i2 = server.indexOf("function requireAuth(");
    const bloque = server.slice(i2, i2 + 1400);
    // Se mira el CÓDIGO, no los comentarios: el porqué sí se explica ahí.
    const codigo = bloque.replace(/\/\/[^\n]*/g, "");
    assert.ok(!/payload\.pass_temporal/.test(codigo),
      "requireAuth no debe mirar pass_temporal: se avisa en la interfaz, no se bloquea");
    assert.ok(!/passwordTemporal/.test(codigo), "y no devuelve el 403 que bloqueaba");
  });

  test("el login pasa por el freno antes de comparar la contraseña", () => {
    const login = /app\.post\("\/api\/auth\/login"[\s\S]{0,2600}/.exec(server)[0];
    const posFreno = login.indexOf("estadoFreno");
    const posCompare = login.indexOf("bcrypt.compare");
    assert.ok(posFreno > 0, "el login mira el freno");
    assert.ok(posFreno < posCompare,
      "y lo mira ANTES de bcrypt: si no, cada intento seguiría costando su CPU");
  });
});
