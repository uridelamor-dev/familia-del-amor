import { randomInt } from 'node:crypto';
import { validarFormatoPin } from '../fichajes/pin.js';
export function generarPinProvisional() {
  let pin;
  do { pin=String(randomInt(0,10000)).padStart(4,'0'); } while (!validarFormatoPin(pin).ok);
  return pin;
}
