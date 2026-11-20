import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { analyzeMatches } from "./src/predictor.js";
import { fetchBulletin } from "./src/bulletin.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/bulletin", async (_, res) => {
  try {
    res.json(await fetchBulletin());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const bulletin = req.body.matches ? null : await fetchBulletin();
    const matches = req.body.matches || bulletin.matches;
    res.json(analyzeMatches(matches));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(Number(process.env.PORT || 3000), () => console.log("IDDAA AI running"));
