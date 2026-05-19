import http from "http";

function request(options, body) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    if (body) req.write(body);
    req.end();
  });
}

const loginBody = JSON.stringify({ username: "direccion", password: "tapeta2024" });
const loginRes = await request({
  host: "localhost", port: 5000, path: "/api/auth/login", method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(loginBody) }
}, loginBody);

const token = loginRes.token;
console.log("Token obtenido:", token ? "OK" : "FALLO");

const testBody = JSON.stringify({ telefono: "622149946" });
const testRes = await request({
  host: "localhost", port: 5000, path: "/api/whatsapp/test", method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "Content-Length": Buffer.byteLength(testBody) }
}, testBody);

console.log("Resultado:", JSON.stringify(testRes));
