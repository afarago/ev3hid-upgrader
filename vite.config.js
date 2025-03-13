import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import https from "vite-plugin-https";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  rroot: path.resolve(__dirname, 'src'),
  server: {
    hot: true,
    https: true,
    // https: {
    //   key: fs.readFileSync(path.resolve(__dirname, "server.key")),
    //   cert: fs.readFileSync(path.resolve(__dirname, "server.cert")),
    // },
    port: 5178,
  },
  plugins: [https()],
});
