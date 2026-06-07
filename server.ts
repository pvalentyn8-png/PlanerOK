import path from "path";
import express from "express";
import app from "./src/backend.js";

async function startServer() {
  const PORT = 3000;

  // Проміжне ПЗ Vite для розробки
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in development mode with Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"), (err) => {
        if (err) {
          console.error("Error sending index.html:", err);
          res.status(500).send("Server Error");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
  }).on('error', (err) => {
    console.error("Server failed to start:", err);
  });
}

startServer().catch((err) => {
  console.error("Unhandled error in startServer:", err);
});
