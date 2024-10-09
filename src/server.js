var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import uuid from "uuid";
import { PrismaClient } from "@prisma/client";
import { parseBuffer } from "music-metadata";
// var session
// let playMusicId = "019059a5-ed64-7662-a26c-2217a4f7b69d.mp3";
// let playMusicId = "0190aa2d-c7ca-7116-9ff1-abf83d95e6cc";
let playMusicId = "0190aa43-89c1-7bbc-ba45-568e2b4a7eb2";
let starttime = new Date();
let pausePosition = 0;
let playstate = "stop";
let clients = [];
const playState = new Map();
// let playtime = 0;
const upload = multer();
const app = express();
app.use(cors({
    origin: "*",
}));
app.use(express.json());
app.use(express.static("public"));
const prisma = new PrismaClient();
/**
 * Administration Section
 */
app.post("/session", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = req.body;
    const retVal = {
        browser: "",
        sessionCode: "",
        playlist: [],
    };
    let sessionCode = body.sessionCode;
    if (!sessionCode) {
        sessionCode = Math.ceil(Math.random() * 1000000)
            .toString()
            .padStart(6, "0");
        yield prisma.session.create({
            data: { code: sessionCode, is_active: true, browser: "firefox" },
        });
    }
    const session = yield prisma.session.findFirst({
        where: { code: sessionCode },
        include: { playlist: true },
    });
    if (!session) {
        return res.status(400).send({ message: "session code not found" });
    }
    retVal.browser = session.browser;
    retVal.sessionCode = session.code;
    retVal.playlist = session.playlist;
    if (!playState.get(sessionCode)) {
        playState.set(sessionCode, {
            playMusicId: "",
            starttime: 0,
            pausePosition: 0,
            playstate: "stop",
        });
    }
    return res.send(retVal);
}));
app.post("/upload", upload.single("file"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const body = req.body;
        const file = req.file;
        const id = uuid.v7();
        if (!body.sessionCode) {
            res.sendStatus(400);
            return;
        }
        const session = yield prisma.session.findFirst({
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
        const musicMetadata = yield parseBuffer(file.buffer);
        fs.writeFile(`./public/msc/${id}`, file.buffer, () => __awaiter(void 0, void 0, void 0, function* () {
            yield prisma.playlist.create({
                data: {
                    id,
                    session_id: session.id,
                    link: `./public/msc/${id}`,
                    title: musicMetadata.common.title || "",
                    author: musicMetadata.common.artist || "",
                    length: musicMetadata.format.duration || 0,
                    size: String(file.buffer.byteLength || 0),
                    format: musicMetadata.format.container || "",
                },
            });
            playMusicId = id;
            res.status(201).send({ playMusicId });
            const playlist = yield prisma.playlist.findMany({
                where: { session_id: session.id },
                orderBy: { createdAt: "desc" },
            });
            sendEvent(body.sessionCode, "playlist", playlist);
        }));
    }
    catch (error) {
        console.error(error.stack);
        res.sendStatus(500);
    }
}));
app.post("/sync", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { body } = req;
    const t1 = new Date();
    if (!body.sessionCode) {
        res.status(400).send({ message: "sessionCode required!" });
        return;
    }
    const state = playState.get(body.sessionCode);
    if (!state) {
        res.status(400).send({ message: "sessionCode not found!" });
        return;
    }
    // const playtime = now.getTime() - starttime.getTime();
    // console.log(now.getTime() / 1000);
    // await delay(500);
    const t2 = new Date();
    res.send({
        playtime: t2.getTime() - state.starttime,
        ts: t2.getTime(),
        t2,
        t1,
    });
}));
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
            if ((isNaN(Number(partialStart)) && partialStart.length > 1) ||
                (isNaN(Number(partialEnd)) && partialEnd.length > 1)) {
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
        }
        else {
            res.header({
                "Content-Type": "audio/mpeg",
                "Content-Length": stat.size,
            });
            readStream = fs.createReadStream(musicPath);
        }
        readStream.pipe(res);
    }
    catch (_a) { }
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
        clients.push({
            session: params.id,
            id: clientId,
            res,
        });
        req.on("close", () => {
            console.log(`${clientId} connection closed`);
            clients = clients.filter((client) => client.id !== clientId);
        });
    }
    catch (error) {
        console.error(error.stack);
        res.sendStatus(500);
    }
});
// Control master
app.post("/control", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = req.body;
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
                if (state.playstate === "stop") {
                    state.starttime = new Date().getTime();
                }
                if (state.playstate === "pause") {
                    state.starttime = new Date().getTime();
                    state.starttime = state.starttime - state.pausePosition;
                }
                state.playstate = "play";
                sendEvent(body.sessionCode, body.type);
                break;
            case "pause":
                if (state.playstate != "play")
                    break;
                state.playstate = "pause";
                state.pausePosition = now.getTime() - state.starttime;
                sendEvent(body.sessionCode, body.type);
                break;
            case "change":
                const msc = yield prisma.playlist.findFirst({
                    where: { session: { code: body.sessionCode }, id: body.val },
                });
                if (!msc)
                    break;
                state.playMusicId = msc.id;
                sendEvent(body.sessionCode, "change", msc.id);
            case "stop":
            default:
                state.playstate = "stop";
                state.pausePosition = 0;
                sendEvent(body.sessionCode, body.type);
                break;
            case "seek":
                sendEvent(body.sessionCode, "sync", Number(body.val || 0));
                break;
        }
        res.status(200).send({ message: "success" });
    }
    catch (error) {
        console.error(error.stack);
        res.sendStatus(500);
    }
}));
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
// const getPlaytime = () => {
//   const now = new Date();
//   let playtime = new Date().getTime();
//   playtime = now.getTime() - starttime.getTime();
//   return playtime;
// };
const delay = (delay) => {
    return new Promise((resolve) => setTimeout(resolve, delay));
};
