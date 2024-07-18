const express = require("express");
const cors = require("cors");
const multer = require("multer");
const upload = multer();
const fs = require("fs");
const uuid = require("uuid");

// var session
// let playMusicId = "019059a5-ed64-7662-a26c-2217a4f7b69d.mp3";
// let playMusicId = "0190aa2d-c7ca-7116-9ff1-abf83d95e6cc";
let playMusicId = "0190aa43-89c1-7bbc-ba45-568e2b4a7eb2";
let starttime = new Date();
let pausePosition = 0;
let playstate = "stop";
let clients = [];
// let playtime = 0;

const app = express();
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());
app.use(express.static("public"));

app.post("/sync", async (req, res) => {
  const now = new Date();
  const playtime = now.getTime() - starttime.getTime();
  console.log(now.getTime() / 1000);
  // await delay(500);
  res.send({ playtime, ts: now.getTime() });
});

app.get("/load/:id", (req, res) => {
  const params = req.params;

  try {
    // reference https://medium.com/@yelee2369/node-js-streaming-audio-files-10dd5e8670d0
    // TODO: filter id
    if (!params.id) {
      res.status(400).send({ message: "id required!" });
      return;
    }

    const musicPath = `./public/msc/${params.id}`;
    const stat = fs.statSync(musicPath);
    const range = req.headers.range;
    let readStream;

    if (range !== undefined) {
      const parts = range.replace(/bytes=/, "").split("-");
      const partialStart = parts[0];
      const partialEnd = parts[1];

      if (
        (isNaN(partialStart) && partialStart.length > 1) ||
        (isNaN(partialEnd) && partialEnd.length > 1)
      ) {
        return res.sendStatus(500);
      }

      const start = parseInt(partialStart, 10);
      const end = partialEnd ? parseInt(partialEnd, 10) : stat.size - 1;

      const contentLength = end - start + 1;
      res.status(206).header({
        "Content-Type": "audio/mpeg",
        "Content-Length": contentLength,
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
      });

      readStream = fs.createReadStream(musicPath, { start, end });
    } else {
      res.header({
        "Content-Type": "audio/mpeg",
        "Content-Length": stat.size,
      });
      readStream = fs.createReadStream(musicPath);
    }
    readStream.pipe(res);
  } catch {}
});

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const body = req.body;
    const file = req.file;
    const id = uuid.v7();

    if (!body.sessionCode) {
      res.sendStatus(400);
      return;
    }
    // TODO: read mimetype, audio metadata

    fs.writeFile(`./public/msc/${id}`, file.buffer, () => {
      playMusicId = id;
      res.status(201).send({ playMusicId });

      sendEvent(body.sessionCode, "change", id);
    });
  } catch (error) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

// Control SSE
app.get("/sse/:id", (req, res) => {
  const params = req.params;

  try {
    if (!params.id) {
      res.status(400).send({ message: "id required" });
      return;
    }

    const headers = {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    };
    res.writeHead(200, headers);

    const clientId = uuid.v4();
    console.log(`${clientId} connection opened`);

    const data = { type: "change", val: playMusicId };
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    // TODO: Check if session is available
    clients.push({
      session: params.id,
      id: clientId,
      res,
    });

    req.on("close", () => {
      console.log(`${clientId} connection closed`);
      clients = clients.filter((client) => client.id !== clientId);
    });
  } catch (error) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

// Control master
app.post("/control", (req, res) => {
  const body = req.body;

  try {
    if (!body.sessionCode) {
      res.status(400).send({ message: "sessionCode required!" });
      return;
    }

    const now = new Date();
    switch (body.type) {
      case "play":
        if (playstate === "stop") starttime = new Date();
        if (playstate === "pause") {
          starttime = new Date();
          starttime = new Date(starttime.getTime() - pausePosition);
        }

        playstate = "play";
        sendEvent(body.sessionCode, body.type);
        break;
      case "pause":
        if (playstate != "play") break;

        playstate = "pause";
        pausePosition = now.getTime() - starttime.getTime();
        sendEvent(body.sessionCode, body.type);
        break;
      case "stop":
      default:
        playstate = "stop";
        pausePosition = 0;
        sendEvent(body.sessionCode, body.type);
        break;
      case "seek":
        sendEvent(body.sessionCode, "sync", Number(body.val || 0));
        break;
    }

    res.status(200).send({ message: "success" });
  } catch (error) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Server running");
});

// Private function
const sendEvent = (sessionCode, type, val) => {
  const data = { type, val };
  const dataFormatted = `data: ${JSON.stringify(data)}\n\n`;
  clients
    .filter((c) => c.session == sessionCode)
    .forEach((c) => c.res.write(dataFormatted));
};

const getPlaytime = () => {
  const now = new Date();
  let playtime = new Date().getTime();

  playtime = now.getTime() - starttime.getTime();

  return playtime;
};

const delay = (delay) => {
  return new Promise((resolve) => setTimeout(resolve, delay));
};
