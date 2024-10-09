import React, { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { FaPlay, FaPause, FaStop, FaPlus } from "react-icons/fa";
import { BiArrowToRight, BiArrowToLeft } from "react-icons/bi";
import "./styles/global.scss";
import {
  TPlaylistData,
  TPlayType,
  TSessionData,
  TSyncData,
} from "../../server";

const baseUrl = "http://192.168.1.80:4000";

type TPlaylist = {
  id: string;
  title: string;
  artist: string;
  length_s: number;
};

type TPlayState = {
  startPlaytime: number;
  delayPlaytime: number;
  currentPlaytime: number;
  seek_timestamp: number;
  playMusicId: string;
  state: TPlayType;
  music?: TPlaylist;
};

const playStateDefault: TPlayState = {
  music: { artist: "", id: "", length_s: 0, title: "" },
  startPlaytime: 0,
  currentPlaytime: 0,
  seek_timestamp: 0,
  state: "stop",
  playMusicId: "",
  delayPlaytime: Number(localStorage.getItem("delayPlaytime") || 0),
};

const useEvent = (props: {
  sessionCode: string;
  onPlay: () => void;
  onPause: () => void;
  onChange: (val: string) => void;
  onStop: () => void;
  onLoadPlaylist: (val: TPlaylistData[]) => void;
}): number => {
  const { sessionCode } = props;
  // if (!props.sessionCode) return EventSource.CLOSED;

  const [evtSource, setEvtSource] = useState<EventSource>();

  useEffect(() => {
    if (!sessionCode) return;

    const _evtSource = new EventSource(`${baseUrl}/sse/${props.sessionCode}`);

    _evtSource.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as { type: TPlayType; val: any };
      switch (data.type) {
        case "play":
        case "sync":
          props.onPlay();
          break;
        case "seek":
          break;
        case "pause":
          props.onPause();
          break;
        case "change":
          props.onChange(data.val);
          break;
        case "playlist":
          props.onLoadPlaylist(data.val);
          break;
        case "stop":
        default:
          props.onStop();
          break;
      }
    };

    setEvtSource(_evtSource);

    return () => {
      _evtSource.onmessage = null;
      _evtSource.close();

      setEvtSource(undefined);
    };
  }, [sessionCode]);

  return evtSource?.readyState !== undefined
    ? evtSource.readyState
    : EventSource.CLOSED;
};

const App = () => {
  // const audCtx = useRef(new AudioContext());
  // const delayNodeRef = useRef<DelayNode | null>(null);
  const seekInputRef = useRef<HTMLInputElement>(null);
  const playlistFormRef = useRef<HTMLFormElement>(null);
  const audElement = useRef(document.createElement("audio"));

  const [debug, setDebug] = useState("");
  const [offsetBuf, setOffsetBuf] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [connected, setConnected] = useState(false);
  const [syncOffset, setSyncOffset] = useState(0);
  const [playState, setPlayState] = useState<TPlayState>(playStateDefault);
  const [playlists, setPlaylists] = useState<TPlaylist[]>([]);
  const [sessionCode, setSessionCode] = useState("");
  const [sessionBrowser, setSessionBrowser] = useState<string>();

  const event = useEvent({
    sessionCode,
    onPlay: () => {
      setPlayState((state) => ({ ...state, state: "sync" }));
      // playSync();
    },
    onPause: () => {
      // audElement.current.pause();
      setPlayState((prev) => ({ ...prev, state: "pause" }));
    },
    onChange: (val) => {
      loadAudio(val);
      setPlayState((prev) => ({ ...prev, playMusicId: val }));
    },
    onStop: () => {
      // audElement.current.pause();
      // audElement.current.currentTime = 0;
      // if (seekInputRef.current) seekInputRef.current.value = "0";
      setPlayState((prev) => ({ ...prev, state: "stop", currentPlaytime: 0 }));
    },
    onLoadPlaylist: (val) => {
      setPlaylists(
        val.map((e) => ({
          id: e.id,
          artist: e.author,
          title: e.title,
          length_s: e.length,
        }))
      );
      setPlayState((prev) => ({ ...prev, state: "playlist" }));
    },
  });

  useEffect(() => {
    // if (playState?.state === "sync") {
    //   setPlayState((state) => ({ ...state, state: "play" }));
    // } else

    switch (playState.state) {
      case "play":
      case "sync":
        playSync();
        break;

      case "pause":
        audElement.current.pause();
        break;
      case "stop":
        audElement.current.pause();
        audElement.current.currentTime = 0;
        if (seekInputRef.current) seekInputRef.current.value = "0";
        break;

      case "seek":
      case "change":
      case "playlist":
    }

    if (playState?.state === "play") {
      const id = setInterval(() => {
        const interval = new Date().getTime() - playState.seek_timestamp;
        let currentPlaytime = playState.startPlaytime + interval;
        currentPlaytime =
          currentPlaytime < (playState.music?.length_s || 0) * 1000
            ? currentPlaytime
            : (playState.music?.length_s || 0) * 1000;
        const val =
          (currentPlaytime / ((playState.music?.length_s || 0) * 1000)) * 1000;

        if (seekInputRef.current)
          seekInputRef.current.value = val < 1000 ? String(val) : "1000";

        setPlayState((state) => {
          return {
            ...state,
            currentPlaytime: currentPlaytime,
          };
        });
      }, 1000);

      return () => {
        clearInterval(id);
      };
    }
  }, [playState?.state, seekInputRef.current]);

  useEffect(() => {
    switch (event) {
      case EventSource.OPEN:
      case EventSource.CONNECTING:
        setConnected(true);
        break;
      case EventSource.CLOSED:
      default:
        setConnected(false);
        break;
    }

    return () => {
      setConnected(false);
    };
  }, [event]);

  useEffect(() => {
    if (connected) {
      initialSync();
    }
  }, [connected]);

  useEffect(() => {
    audElement.current.crossOrigin = "anonymous";
    // const track = audCtx.current.createMediaElementSource(audElement.current);
    // const delayNode = audCtx.current.createDelay();

    // track.connect(delayNode).connect(audCtx.current.destination);
    // delayNodeRef.current = delayNode;
  }, []);

  useEffect(() => {
    if (playState.playMusicId) loadAudio(playState.playMusicId);
  }, [playState.playMusicId]);

  useEffect(() => {
    if (playState.playMusicId && playState.state === "play") playSync();
  }, [playState.delayPlaytime, playState.playMusicId]);

  useEffect(() => {
    const temp2 = structuredClone(offsetBuf).sort((a, b) => a - b);
    const medianOffset = temp2[5];
    const std = getStandardDeviation(structuredClone(offsetBuf));

    const temp3 = temp2.filter(
      (val) => val >= medianOffset - std || val <= medianOffset + std
    );

    const offset = getMean(temp3);
    setSyncOffset(offset);
  }, [JSON.stringify(offsetBuf)]);

  // useEffect(() => {
  //   console.log(playState.state);
  // }, [playState]);

  const playSync = async () => {
    const [playtime, offset, delay, syncDelay] = await sync();

    let adjustedPlaytime = playtime;
    // adjustedPlaytime = adjustedPlaytime + delay / 2;
    adjustedPlaytime = adjustedPlaytime + syncDelay;

    const startTime = new Date();
    await play();
    const endTime = new Date();

    let playDelay =
      endTime.getTime() - startTime.getTime() + playState.delayPlaytime;
    const seekTime = (adjustedPlaytime + playDelay) / 1000;
    seek(seekTime);

    setDebug(
      JSON.stringify({
        adjustedPlaytime,
        delay,
        playDelay,
        offset,
        syncDelay,
        syncOffset,
      })
    );

    setPlayState((state) => ({
      ...state,
      currentPlaytime: adjustedPlaytime + playDelay * 2,
      startPlaytime: adjustedPlaytime + playDelay * 2,
      seek_timestamp: new Date().getTime(),
      state: "play",
    }));
  };

  const sync = async () => {
    let offset = 0;
    let delay = 0;
    let t0 = new Date().getTime();
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    let playtime = 0;

    const fetchOptions: RequestInit = {
      method: "POST",
      body: JSON.stringify({ sessionCode }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    const resp = await fetch(`${baseUrl}/sync`, fetchOptions);
    const data = (await resp.json()) as TSyncData;

    t3 = new Date().getTime();
    t1 = data.ts;
    t2 = data.ts;

    offset = (t1 - t0 + (t2 - t3)) / 2;
    delay = t3 - t0 - (t2 - t1);
    playtime = data.playtime;
    const syncDelay = t3 - t2 + syncOffset;

    return [playtime, offset, delay, syncDelay];
  };

  const initialSync = async () => {
    if (!syncOffset) {
      let datas: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const data = await sync();
        datas.push(data);
      }

      setOffsetBuf(datas.map((e) => e[1]));
    }
  };

  const play = async () => {
    await audElement.current.play();
  };

  const seek = (val: number) => {
    if (Number.isNaN(val)) return;

    const stepDelay = Math.floor((1 - (val % 1)) * 1000);
    setTimeout(() => {
      audElement.current.currentTime = Math.round(val + stepDelay / 1000);
    }, stepDelay);
  };

  const loadAudio = (id: string) => {
    audElement.current.src = `${baseUrl}/load/${id}`;
    // audElement.current.load();

    setPlayState((state) => {
      const msc = playlists.find((e) => e.id === id);
      return { ...state, music: msc };
    });
  };

  const fetchControl = async (type: TPlayType, val?: string) => {
    if (!sessionCode) return;
    await fetch(`${baseUrl}/control`, {
      body: JSON.stringify({ sessionCode, type, val }),
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  };

  const onPlay = async () => {
    if (!playState.playMusicId) return;

    // await audCtx.current.resume();
    await audElement.current.play();
    await fetchControl("play");
  };

  const onSeek = (ev: React.MouseEvent<HTMLInputElement>) => {
    ev.preventDefault();

    const target = ev.target as HTMLInputElement;
    fetchControl("seek", target.value);
  };

  const onPause = async () => {
    await fetchControl("pause");
  };

  const onStop = async () => {
    await fetchControl("stop");
  };

  const onChangeFormPlaylist = async (
    ev: React.FormEvent<HTMLInputElement>
  ) => {
    ev.preventDefault();
    if (!connected) {
      alert("session not connected!");
      return;
    }
    if (!playlistFormRef.current) return;

    const formData = new FormData(playlistFormRef.current);
    formData.set("sessionCode", sessionCode);

    await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    });
  };

  const onPrevPlay = async () => {
    const currentIdx = playlists
      .map((e) => e.id)
      .indexOf(playState.playMusicId);
    if (currentIdx < 0) return;
    if (currentIdx === 0) return;

    fetchControl("change", playlists[currentIdx - 1].id);
  };

  const onNextPlay = async () => {
    const currentIdx = playlists
      .map((e) => e.id)
      .indexOf(playState.playMusicId);
    if (currentIdx < 0) return;
    if (currentIdx > playlists.length - 2) return;

    fetchControl("change", playlists[currentIdx + 1].id);
  };

  const onChangeDelay = (type: "delay" | "forward") => {
    const step = type === "delay" ? -10 : 10;

    setPlayState((state) => {
      const val = state.delayPlaytime + step;
      localStorage.setItem("delayPlaytime", String(val));

      return { ...state, delayPlaytime: val };
    });
  };

  const onSubmitSession = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    // audCtx.current.resume();
    const formData = new FormData(ev.target as HTMLFormElement);
    const sessionCode = formData.get("sessionCode")?.toString() || "";

    // Handle disconnect
    // TODO: moving to useEffect
    if (connected) {
      setSessionCode("");
      setSessionBrowser("");
      setPlayState(playStateDefault);
      setPlaylists([]);
      if (seekInputRef.current) seekInputRef.current.value = "0";
      audElement.current.pause();
      audElement.current.currentTime = 0;
      return;
    }

    const data = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionCode }),
    });
    const respSession = (await data.json()) as TSessionData;

    setPlayState({
      ...playStateDefault,
      playMusicId: respSession.playMusicId,
    });
    setSessionCode(sessionCode);
    setSessionBrowser(respSession.browser);
    setPlaylists(
      respSession.playlist.map((e) => ({
        id: e.id,
        artist: e.author,
        title: e.title,
        length_s: e.length,
      }))
    );

    localStorage.setItem("sessionCode", sessionCode);
  };

  const checkBrowser = () => {
    if (
      (navigator.userAgent.indexOf("Opera") ||
        navigator.userAgent.indexOf("OPR")) !== -1
    )
      return "Opera";
    else if (navigator.userAgent.indexOf("Edg") !== -1) return "Edge";
    else if (navigator.userAgent.indexOf("Chrome") !== -1) return "Chrome";
    else if (navigator.userAgent.indexOf("Safari") !== -1) return "Safari";
    else if (navigator.userAgent.indexOf("Firefox") !== -1) return "Firefox";
    else return "IE";
  };

  const getStandardDeviation = (array: number[]) => {
    const n = array.length;
    const mean = array.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(
      array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n
    );
  };
  const getMean = (array: number[]) => {
    const n = array.length;
    const mean = array.reduce((a, b) => a + b, 0) / n;

    return mean;
  };

  const browser = checkBrowser();

  return (
    <div className={clsx(["app l-container l-flex"])}>
      {/* Session */}
      <section
        className={clsx(["session l-flex", connected ? "s-connected" : ""])}
      >
        <div className="status">
          <div className="dot">{"\u00A0"}</div>
          <div className="text">{connected ? "connected" : "disconnected"}</div>
        </div>

        <form onSubmit={onSubmitSession}>
          <div className="session-form">
            <div className="input-form">
              <label htmlFor="sessionCode">Session Code</label>
              <input
                id="sessionCode"
                name="sessionCode"
                defaultValue={localStorage.getItem("sessionCode") || ""}
                disabled={connected}
              ></input>
            </div>
            <button>{connected ? "Disconnect" : "Connect"}</button>
          </div>
        </form>

        <div>
          Session browser: <span>{sessionBrowser}</span>
        </div>

        {sessionBrowser && sessionBrowser !== browser && (
          <div className="banner">
            <div className="flag">{"\u00A0"}</div>
            <div>
              WARNING!! Current browser do not match session browser!, this will
              cause audio timing issue with another devices when synching
            </div>
          </div>
        )}
      </section>

      {/* Control */}
      <section className="control">
        <div className="display">
          <div className="timing">
            <div>
              <FaPlay />
            </div>
            <div>
              {String(
                Math.floor((playState?.currentPlaytime || 0) / (60 * 1000))
              ).padStart(2, "0")}
              :
              {String(
                Math.floor(
                  ((playState?.currentPlaytime || 0) % (60 * 1000)) / 1000
                )
              ).padStart(2, "0")}
            </div>
          </div>
          <div>
            {playState?.music?.title} - {playState?.music?.artist}
          </div>
        </div>

        <div className="seek">
          <input
            ref={seekInputRef}
            onMouseUp={onSeek}
            type="range"
            id="seek-time"
            name="seek-time"
            defaultValue={"0"}
            min="0"
            max="1000"
          />
        </div>

        <div className="audio-control">
          <span>Delay: </span>
          <button
            onClick={() => {
              onChangeDelay("delay");
            }}
          >
            -
          </button>
          {playState.delayPlaytime} ms
          <button
            onClick={() => {
              onChangeDelay("forward");
            }}
          >
            +
          </button>
        </div>

        <div className="btn-control">
          <button className="bi" onClick={() => onPrevPlay()}>
            <BiArrowToLeft />
          </button>
          <button onClick={() => onPause()}>
            <FaPause />
          </button>
          <button onClick={() => onPlay()}>
            <FaPlay />
          </button>
          <button onClick={() => onStop()}>
            <FaStop />
          </button>
          <button className="bi" onClick={() => onNextPlay()}>
            <BiArrowToRight />
          </button>
        </div>
      </section>

      {/* Debug */}
      <div>{debug}</div>

      {/* Playlist */}
      <section className="playlist">
        <div className="playlist-action">
          <form ref={playlistFormRef}>
            <button type="button">
              <label htmlFor="upload">
                <span aria-hidden="true">
                  <FaPlus />
                </span>
              </label>
            </button>
            <input
              type="file"
              id="upload"
              name="file"
              onChange={onChangeFormPlaylist}
            />
          </form>
        </div>
        <ul>
          {playlists.map((playlist, idx) => {
            return (
              <li
                key={playlist.id}
                className={
                  playlist.id === playState.playMusicId ? "s-active" : ""
                }
                onClick={() => {
                  if (playState.playMusicId === playlist.id) return;

                  fetchControl("change", playlist.id);
                }}
              >
                <div>{String(idx + 1).padStart(2, "0")}.</div>
                <div className="content">
                  <div>{playlist.title || "Unknown title"}</div>
                  <div>{playlist.artist || "Unknown artist"}</div>
                </div>
                <div>
                  {String(Math.floor(playlist.length_s / 60)).padStart(2, "0")}:
                  {String(playlist.length_s % 60).padStart(2, "0")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default App;
