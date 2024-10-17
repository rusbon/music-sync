import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import "dotenv/config";
import { v4, v7 } from "uuid";
import { playlist, Prisma, PrismaClient } from "@prisma/client";
import { parseBuffer } from "music-metadata";
import Ffmpeg from "ffmpeg";

export type TPlayType =
  | "play"
  | "stop"
  | "pause"
  | "seek"
  | "sync"
  | "change"
  | "playlist"
  | "ping";

export type TSyncData = {
  playtime: number;
  ts: number;
  t2: Date;
  t1: Date;
};

export type TPlaylistData = playlist;

export type TSessionData = {
  browser: string;
  sessionCode: string;
  playMusicId: string;
  playlist: TPlaylistData[];
};

export type TPlayState = {
  playMusicId: string;
  nextPlayMusicId: string;
  nextTimeoutId: NodeJS.Timeout | undefined;
  pingIntervalId: NodeJS.Timeout | undefined;
  starttime: number;
  pausePosition: number;
  length_s: number;
  playstate: TPlayType;
};

// var session
// let playMusicId = "019059a5-ed64-7662-a26c-2217a4f7b69d.mp3";
// let playMusicId = "0190aa2d-c7ca-7116-9ff1-abf83d95e6cc";
// let playMusicId = "0190aa43-89c1-7bbc-ba45-568e2b4a7eb2";
let starttime = new Date();
let pausePosition = 0;
let playstate = "stop";
let clients: { session: string; id: string; res: express.Response }[] = [];
const playState = new Map<string, TPlayState>();
// let playtime = 0;

const upload = multer();
const app = express();
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());
app.use(express.static("public"));
app.use(express.static("msc"));
const prisma = new PrismaClient();

/**
 * Administration Section
 */
app.post("/session", async (req, res) => {
  const body = req.body;

  const retVal: {
    browser: string;
    sessionCode: string;
    playlist: any[];
    playMusicId: string;
  } = {
    browser: "",
    sessionCode: "",
    playlist: [],
    playMusicId: "",
  };

  let sessionCode: string = body.sessionCode;
  if (!sessionCode) {
    sessionCode = Math.ceil(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");

    await prisma.session.create({
      data: { code: sessionCode, is_active: true, browser: body.browser },
    });
  }

  const session = await prisma.session.findFirst({
    where: { code: sessionCode },
    include: { playlist: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    return res.status(400).send({ message: "session code not found" });
  }

  retVal.browser = session.browser;
  retVal.sessionCode = session.code;
  retVal.playlist = session.playlist;

  const intervalId = setInterval(() => {
    sendEvent(sessionCode, "ping");
  }, 30_000);

  if (!playState.get(sessionCode)) {
    playState.set(sessionCode, {
      playMusicId: "",
      nextPlayMusicId: "",
      nextTimeoutId: undefined,
      starttime: 0,
      pausePosition: 0,
      length_s: 0,
      playstate: "stop",
      pingIntervalId: intervalId,
    });
  }

  retVal.playMusicId = playState.get(sessionCode)?.playMusicId || "";

  return res.send(retVal);
});

app.post("/playlist", upload.single("file"), async (req, res) => {
  try {
    const body = req.body;
    const file = req.file;
    const id = v7();

    if (!body.sessionCode) {
      res.sendStatus(400);
      return;
    }
    const session = await prisma.session.findFirst({
      where: { code: body.sessionCode },
    });
    if (!session) {
      res.sendStatus(400);
      return;
    }
    if (!file) {
      res.sendStatus(400);
      return;
    }

    const musicMetadata = await parseBuffer(file.buffer);

    if (!fs.existsSync("./msc/")) {
      fs.mkdirSync("./msc/");
    }

    fs.writeFile(`./msc/${id}`, file.buffer, async () => {
      // Convert to OPUS for efficient storage
      let encSuccess = false;
      try {
        const enc = await new Ffmpeg(`./msc/${id}`);
        // enc.setAudioCodec("libopus");
        enc.setAudioBitRate(96);
        await enc.save(`./msc/${id}.opus`);

        fs.rmSync(`./msc/${id}`);
        encSuccess = true;
      } catch (e) {
        console.error({ e });
      }

      if (!encSuccess) {
        fs.rmSync(`./msc/${id}`);
        res.status(500).send({ message: "error" });
        return;
      }

      await prisma.playlist.create({
        data: {
          id,
          session_id: session.id,
          link: `./msc/${id}.opus`,
          title: musicMetadata.common.title || "",
          author: musicMetadata.common.artist || "",
          length: musicMetadata.format.duration || 0,
          size: String(file.buffer.byteLength || 0),
          format: musicMetadata.format.container || "",
        },
      });

      res.status(201).send({ message: "success" });

      const playlist = await prisma.playlist.findMany({
        where: { session_id: session.id },
        orderBy: { createdAt: "asc" },
      });
      sendEvent(body.sessionCode, "playlist", playlist);
    });
  } catch (error: any) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

app.post("/playlist/delete", async (req, res) => {
  const body = req.body;

  if (!body.sessionCode || !body.id) {
    res.sendStatus(400);
    return;
  }

  const session = await prisma.session.findFirst({
    where: { code: body.sessionCode },
  });
  const msc = await prisma.playlist.findFirst({
    where: { id: body.id },
  });

  const state = playState.get(body.sessionCode);

  if (!session) {
    res.sendStatus(400);
    return;
  }
  if (!state) return res.status(400).send({ message: "session not started" });
  if (!msc) return res.status(400).send({ message: "music not exist" });

  await prisma.playlist.delete({
    where: {
      id: msc.id,
      session: { code: session.code },
    },
  });
  fs.rmSync(`./msc/${body.id}`, { force: true });

  res.status(201).send({ message: "success" });

  helperControlNextTimeout(body.sessionCode, state);
  const playlist = await prisma.playlist.findMany({
    where: { session_id: session.id },
    orderBy: { createdAt: "asc" },
  });

  sendEvent(body.sessionCode, "playlist", playlist);
});

app.post("/sync", async (req, res) => {
  const { body } = req;
  const t1 = new Date();

  // if (!body.sessionCode) {
  //   res.status(400).send({ message: "sessionCode required!" });
  //   return;
  // }
  // const state = playState.get(body.sessionCode);
  // if (!state) {
  //   res.status(400).send({ message: "sessionCode not found!" });
  //   return;
  // }

  // const playtime = now.getTime() - starttime.getTime();

  // console.log(now.getTime() / 1000);
  // await delay(500);
  const t2 = new Date();
  res.send({
    // playtime: t2.getTime() - state.starttime,
    playtime: 0,
    ts: t2.getTime(),
    t2,
    t1,
  } as TSyncData);
});

app.get("/load/:id", async (req, res) => {
  const params = req.params;

  try {
    // reference https://medium.com/@yelee2369/node-js-streaming-audio-files-10dd5e8670d0
    // TODO: filter id
    if (!params.id) {
      res.status(400).send({ message: "id required!" });
      return;
    }

    const msc = await prisma.playlist.findFirst({
      where: { id: params.id },
      select: { link: true },
    });

    if (!msc) {
      res.status(400).send({ message: "music not found!" });
      return;
    }

    const musicPath = msc.link;
    const stat = fs.statSync(musicPath);
    const range = req.headers.range;
    let readStream;

    if (range !== undefined) {
      const parts = range.replace(/bytes=/, "").split("-");
      const partialStart = parts[0];
      const partialEnd = parts[1];

      if (
        (isNaN(Number(partialStart)) && partialStart.length > 1) ||
        (isNaN(Number(partialEnd)) && partialEnd.length > 1)
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

// Control SSE
app.get("/sse/:id", (req, res) => {
  const params = req.params;

  try {
    if (!params.id) {
      res.status(400).send({ message: "id required" });
      return;
    }
    if (!playState.get(params.id)) {
      res.status(400).send({ message: "session not started" });
      return;
    }

    const headers = {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    };
    res.writeHead(200, headers);

    const clientId = v4();
    console.log(`${clientId} connection opened`);

    // const data = { type: "change", val: playMusicId };
    // res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.write(``);

    clients.push({
      session: params.id,
      id: clientId,
      res,
    });

    req.on("close", () => {
      console.log(`${clientId} connection closed`);
      clients = clients.filter((client) => client.id !== clientId);
    });
  } catch (error: any) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

// Control master
type TControlBody = { sessionCode: string; type: TPlayType; val: any };
app.post("/control", async (req, res) => {
  const body = req.body as TControlBody;

  try {
    if (!body.sessionCode) {
      res.status(400).send({ message: "sessionCode required!" });
      return;
    }

    const state = playState.get(body.sessionCode);
    if (!state) {
      return res.status(400).send({ message: "session not started" });
    }

    const now = new Date();
    switch (body.type) {
      case "play":
      case "sync":
        if (state.playstate === "stop") {
          state.starttime = now.getTime();
        }
        if (state.playstate === "pause") {
          state.starttime = now.getTime();
          state.starttime = state.starttime - state.pausePosition;
        }
        state.playstate = "play";
        helperControlNextTimeout(body.sessionCode, state);

        sendEvent(body.sessionCode, body.type, state.starttime);
        break;
      case "pause":
        if (state.playstate != "play") break;

        state.playstate = "pause";
        state.pausePosition = now.getTime() - state.starttime;
        clearTimeout(state.nextTimeoutId);
        state.nextTimeoutId = undefined;

        sendEvent(body.sessionCode, body.type);
        break;
      case "change":
        clearTimeout(state.nextTimeoutId);
        await helperControlMusicChange(body, state);
        helperControlNextTimeout(body.sessionCode, state);
        break;
      case "playlist":
        break;
      case "stop":
      default:
        state.playstate = "stop";
        state.pausePosition = 0;
        clearTimeout(state.nextTimeoutId);
        sendEvent(body.sessionCode, body.type);
        break;
      case "seek":
        const val = ((Number(body.val) || 0) / 1000) * state.length_s * 1000;
        const startTime = now.getTime() - val;
        state.starttime = startTime;

        clearTimeout(state.nextTimeoutId);
        state.nextTimeoutId = undefined;
        if (state.playstate == "play") {
          helperControlNextTimeout(body.sessionCode, state);
        }

        if (state.playstate == "pause") {
          state.pausePosition = val;
          sendEvent(body.sessionCode, "seek", state.starttime);
          break;
        }

        sendEvent(body.sessionCode, "sync", state.starttime);
        break;
    }

    res.status(200).send({ message: "success" });
  } catch (error: any) {
    console.error(error.stack);
    res.sendStatus(500);
  }
});

const helperControlMusicChange = async (
  body: TControlBody,
  state: TPlayState
) => {
  const msc = await prisma.playlist.findMany({
    take: 2,
    cursor: { id: body.val },
    orderBy: { createdAt: "asc" },
    where: { session: { code: body.sessionCode } },
    select: { id: true, length: true },
  });
  if (!msc[0]) return;

  state.playMusicId = msc[0].id;
  state.nextPlayMusicId = msc[1]?.id || "";
  state.pausePosition = 0;
  state.length_s = msc[0].length;
  sendEvent(body.sessionCode, "change", msc[0].id);
  sendEvent(body.sessionCode, "stop");
  await delay(1000);
  state.starttime = new Date().getTime();

  if (state.playstate === "play") {
    state.playstate = "play";
    sendEvent(body.sessionCode, "play", state.starttime);

    // (async () => {
    //   // Send sync event for first 3 seconds
    //   await delay(1000);
    //   if (state.playstate == "play")
    //     sendEvent(
    //       body.sessionCode,
    //       "play",
    //       JSON.stringify({ playtime: 0, ts: Date.now() })
    //     );
    //   await delay(1000);
    //   if (state.playstate == "play")
    //     sendEvent(
    //       body.sessionCode,
    //       "play",
    //       JSON.stringify({ playtime: 0, ts: Date.now() })
    //     );
    //   await delay(1000);
    //   if (state.playstate == "play")
    //     sendEvent(
    //       body.sessionCode,
    //       "play",
    //       JSON.stringify({ playtime: 0, ts: Date.now() })
    //     );
    // })();
  } else {
    state.playstate = "stop";
  }
};

const helperControlNextTimeout = (sessionCode: string, state: TPlayState) => {
  const id = state.nextPlayMusicId;
  if (id && !state.nextTimeoutId) {
    const end_ms =
      state.length_s * 1000 - (new Date().getTime() - state.starttime) + 3000;
    state.nextTimeoutId = setTimeout(async () => {
      await helperControlMusicChange(
        {
          sessionCode: sessionCode,
          type: "change",
          val: id,
        },
        state
      );

      state.nextTimeoutId = undefined;
      helperControlNextTimeout(sessionCode, state);
    }, end_ms);
    console.log(`next change at ${end_ms} ms. ${state.nextTimeoutId}`);
  } else {
    console.log("no next scheduled change");
  }
};

app.listen(4000, () => {
  console.log("Server running at 4000");
});

// Private function
const sendEvent = (sessionCode: string, type: TPlayType, val?: any) => {
  const data = { type, val };
  clients
    .filter((c) => c.session == sessionCode)
    .forEach((c) => {
      switch (type) {
        case "play":
        case "seek":
        case "sync":
          data.val = JSON.stringify({
            playtime: Date.now() - Number(val),
            ts: Date.now(),
          });
          break;

        case "stop":
        case "pause":
        case "change":
        case "playlist":
          break;
      }
      const dataFormatted = `data: ${JSON.stringify(data)}\n\n`;
      c.res.write(dataFormatted);
    });
};

// const getPlaytime = () => {
//   const now = new Date();
//   let playtime = new Date().getTime();

//   playtime = now.getTime() - starttime.getTime();

//   return playtime;
// };

const delay = (delay: number) => {
  return new Promise((resolve) => setTimeout(resolve, delay));
};

