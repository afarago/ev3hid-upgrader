import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import https from "vite-plugin-https";
// import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  server: {
    hot: true,
    https: true,
    // https: {
    //   key: fs.readFileSync(path.resolve(__dirname, "server.key")),
    //   cert: fs.readFileSync(path.resolve(__dirname, "server.cert")),
    // },
    port: 5178,
  },
  plugins: [
    https(),
    // nodePolyfills({
    //   protocolImports: true,
    // }),
  ],
  build: {
    outDir: './dist',
  },
});
