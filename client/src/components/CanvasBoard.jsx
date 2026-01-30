import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

function drawLine(ctx, start, end, style) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
}

function drawStroke(ctx, stroke) {
    const pts = stroke.points || [];
    if (pts.length < 2) return;

    for (let i = 1; i < pts.length; i++) {
        drawLine(ctx, pts[i - 1], pts[i], stroke.style);
    }
}

function getCanvasCoordinates(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
}

export default function CanvasBoard() {
    const canvasRef = useRef(null);
    const ctxRef = useRef(null);

    const isDrawingRef = useRef(false);
    const lastPointRef = useRef(null);

    const myStrokeIdRef = useRef(null);

    // strokeId -> { last, style }
    const remoteStrokeMapRef = useRef({});

    const batchRef = useRef([]);
    const rafRef = useRef(null);


    const [roomId, setRoomId] = useState("room-1");
    const [joinedRoom, setJoinedRoom] = useState("");
    const [users, setUsers] = useState({});
    const [cursors, setCursors] = useState({});

    const [color, setColor] = useState("#ffffff");
    const [width, setWidth] = useState(4);
    const [mode, setMode] = useState("pen"); // "pen" | "eraser"

    const incSize = () => setWidth((w) => Math.min(20, w + 1));
    const decSize = () => setWidth((w) => Math.max(2, w - 1));

    const socket = useMemo(() => {
        return io(SERVER_URL, {
            transports: ["polling", "websocket"],
        });
    }, []);

    const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);

        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctxRef.current = ctx;
    };

    const clearLocalCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    useEffect(() => {
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
        return () => window.removeEventListener("resize", resizeCanvas);
    }, []);

    useEffect(() => {
        socket.on("connect", () => {
            console.log("✅ CONNECTED:", socket.id);
        });

        socket.on("room_joined", ({ roomId }) => {
            console.log("✅ Joined room:", roomId);
            setJoinedRoom(roomId);
            setCursors({});
        });

        // ✅ FULL STATE: clear and redraw everything
        socket.on("room_state", ({ roomId, strokes }) => {
            console.log("📦 room_state", roomId, strokes.length);

            clearLocalCanvas();
            remoteStrokeMapRef.current = {};

            const ctx = ctxRef.current;
            if (!ctx) return;

            for (const s of strokes) {
                drawStroke(ctx, s);
                if (s.points?.length) {
                    remoteStrokeMapRef.current[s.id] = {
                        last: s.points[s.points.length - 1],
                        style: s.style,
                    };
                }
            }
        });

        // ✅ LIVE REMOTE STROKES
        socket.on("stroke_start", (stroke) => {
            if (!stroke?.id) return;

            remoteStrokeMapRef.current[stroke.id] = {
                last: stroke.points?.[0] || null,
                style: stroke.style,
            };
        });

        socket.on("stroke_add", ({ strokeId, point }) => {
            const ctx = ctxRef.current;
            if (!ctx) return;

            const obj = remoteStrokeMapRef.current[strokeId];
            if (!obj || !obj.last) {
                remoteStrokeMapRef.current[strokeId] = {
                    last: point,
                    style: obj?.style,
                };
                return;
            }

            drawLine(ctx, obj.last, point, obj.style);
            remoteStrokeMapRef.current[strokeId] = { last: point, style: obj.style };
        });

        // ghost cursors
        socket.on("cursor_move", ({ userId, x, y }) => {
            setCursors((prev) => ({
                ...prev,
                [userId]: { x, y },
            }));
        });

        socket.on("cursor_leave", ({ userId }) => {
            setCursors((prev) => {
                const cp = { ...prev };
                delete cp[userId];
                return cp;
            });
        });

        socket.on("stroke_batch", ({ strokeId, points }) => {
            const ctx = ctxRef.current;
            if (!ctx) return;

            const obj = remoteStrokeMapRef.current[strokeId];
            if (!obj || !obj.last) return;

            for (const p of points) {
                drawLine(ctx, obj.last, p, obj.style);
                obj.last = p;
            }

            remoteStrokeMapRef.current[strokeId] = obj;
        });

        socket.on("user_profile", ({ userId, name, color }) => {
            setUsers((prev) => ({
                ...prev,
                [userId]: { name, color },
            }));
            setColor(color);
        });

        socket.on("user_joined", ({ userId, name, color }) => {
            setUsers((prev) => ({
                ...prev,
                [userId]: { name, color },
            }));
        });

        socket.on("room_users", ({ users }) => {
            const map = {};
            for (const u of users) map[u.userId] = { name: u.name, color: u.color };
            setUsers(map);
        });


        socket.on("room_left", ({ roomId }) => {
            console.log("🚪 room_left:", roomId);
        });

        socket.on("clear_canvas", () => {
            clearLocalCanvas();
            remoteStrokeMapRef.current = {};
        });

        return () => {
            socket.off("connect");
            socket.off("room_joined");
            socket.off("room_state");
            socket.off("stroke_start");
            socket.off("stroke_add");
            socket.off("cursor_move");
            socket.off("cursor_leave");
            socket.off("stroke_batch");
            socket.off("user_profile");
            socket.off("user_joined");
            socket.off("room_users");
            socket.off("room_left");
            socket.off("clear_canvas");
        };
    }, [socket]);

    const joinRoom = () => {
        const rid = roomId.trim();
        if (!rid) return;
        socket.emit("join_room", { roomId: rid });
    };

    const undoMyStroke = () => {
        if (!joinedRoom) return;
        socket.emit("undo", { roomId: joinedRoom });
    };

    const clearRoomCanvas = () => {
        if (!joinedRoom) return;
        socket.emit("clear_canvas", { roomId: joinedRoom });
    };

    const redoMyStroke = () => {
        if (!joinedRoom) return;
        socket.emit("redo", { roomId: joinedRoom });
    };

    const flushBatch = () => {
        if (!joinedRoom) return;
        if (!myStrokeIdRef.current) return;

        const pts = batchRef.current;
        if (pts.length === 0) return;

        socket.emit("stroke_batch", {
            roomId: joinedRoom,
            strokeId: myStrokeIdRef.current,
            points: pts,
        });

        batchRef.current = [];
    };

    const leaveRoom = () => {
        if (!joinedRoom) return;

        socket.emit("leave_room", { roomId: joinedRoom });

        // reset locally instantly (best UX)
        setJoinedRoom("");
        setCursors({});
        setUsers({});
        remoteStrokeMapRef.current = {};
        clearLocalCanvas();
    };



    const handlePointerDown = (e) => {
        if (!joinedRoom) return;

        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        isDrawingRef.current = true;

        const pt = getCanvasCoordinates(e, canvas);
        lastPointRef.current = pt;

        const strokeId = crypto.randomUUID?.() || String(Date.now()) + Math.random();
        myStrokeIdRef.current = strokeId;

        const style = {
            color: mode === "eraser" ? "#000000" : color,
            width,
        };


        // start stroke on server (and others)
        socket.emit("stroke_start", {
            roomId: joinedRoom,
            strokeId,
            point: pt,
            style,
        });
    };

    const handlePointerMove = (e) => {
        if (!joinedRoom) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const curr = getCanvasCoordinates(e, canvas);

        // cursor always
        socket.emit("cursor_move", {
            roomId: joinedRoom,
            x: curr.x,
            y: curr.y,
        });

        if (!isDrawingRef.current) return;

        const ctx = ctxRef.current;
        if (!ctx) return;

        const prev = lastPointRef.current;
        if (!prev) {
            lastPointRef.current = curr;
            return;
        }

        const style = {
            color: mode === "eraser" ? "#000000" : color,
            width,
        };

        drawLine(ctx, prev, curr, style);

        // socket.emit("stroke_add", {
        //     roomId: joinedRoom,
        //     strokeId: myStrokeIdRef.current,
        //     point: curr,
        // });

        batchRef.current.push(curr);

        // schedule flush once per frame
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
                flushBatch();
                rafRef.current = null;
            });
        }

        lastPointRef.current = curr;
    };

    const handlePointerUp = () => {
        if (!joinedRoom) return;

        isDrawingRef.current = false;
        lastPointRef.current = null;

        flushBatch();

        if (myStrokeIdRef.current) {
            socket.emit("stroke_end", {
                roomId: joinedRoom,
                strokeId: myStrokeIdRef.current,
            });
        }

        myStrokeIdRef.current = null;
    };

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-black">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 z-0 h-full w-full touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />

            {/* Ghost Cursors Layer */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {Object.entries(cursors).map(([id, pos]) => {
                    const meta = users[id];
                    const nm = meta?.name || id.slice(0, 4);
                    const col = meta?.color || "#22c55e";

                    return (
                        <div
                            key={id}
                            className="absolute"
                            style={{
                                left: pos.x,
                                top: pos.y,
                                transform: "translate(-50%, -50%)",
                            }}
                        >
                            <div
                                className="w-3 h-3 rounded-full shadow-lg"
                                style={{ backgroundColor: col }}
                            />
                            <div className="mt-1 text-[10px] text-white/80 bg-black/60 px-2 py-[2px] rounded-md">
                                {nm}
                            </div>
                        </div>
                    );
                })}

            </div>

            {/* Panel */}
            <div
                className="
      absolute top-4 left-4 z-50 w-85
      rounded-2xl border border-white/10
      bg-white/10 backdrop-blur-xl
      shadow-2xl shadow-black/40
      p-4 space-y-4
    "
            >
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold tracking-wide text-white">
                        🎨 MVP-5 Undo
                    </div>

                    <div className="text-[11px] px-2 py-1 rounded-full bg-black/40 border border-white/10 text-white/70">
                        Live
                    </div>
                </div>

                {/* Room Join */}
                <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-white/50">
                        Room
                    </div>

                    <div className="flex gap-2">
                        <input
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            placeholder="Enter Room ID"
                            className="
            flex-1 px-3 py-2 rounded-xl
            bg-black/40 border border-white/10
            text-white placeholder:text-white/40
            outline-none text-sm
            focus:border-white/30 focus:ring-2 focus:ring-white/10
            transition
          "
                        />

                        <button
                            onClick={joinRoom}
                            disabled={!!joinedRoom}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.98]
            ${!roomId.trim()
                                    ? "bg-white/20 text-white/40 cursor-not-allowed"
                                    : "bg-white text-black hover:bg-white/90 cursor-pointer"
                                }
          `}
                        >
                            Join
                        </button>
                        <button
                            onClick={leaveRoom}
                            disabled={!joinedRoom}
                            className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-white/10
  bg-zinc-700/90 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            Leave Room
                        </button>

                    </div>

                    <div className="text-xs text-white/70">
                        Room:{" "}
                        <span className={joinedRoom ? "text-green-300" : "text-yellow-300"}>
                            {joinedRoom || "Not joined"}
                        </span>
                    </div>
                </div>

                {/* Brush Section */}
                <div className="space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-white/50">
                        Brush
                    </div>

                    {/* Colors */}
                    <div className="flex gap-2 flex-wrap">
                        {["#ffffff", "#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7"].map(
                            (c) => (
                                <button
                                    key={c}
                                    onClick={() => {
                                        setMode("pen");
                                        setColor(c);
                                    }}
                                    className={`
                w-8 h-8 rounded-full
                border transition
                hover:scale-105 active:scale-95
                ${color === c && mode === "pen"
                                            ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                                            : "border-white/15 hover:border-white/40"
                                        }
              `}
                                    style={{ backgroundColor: c }}
                                />
                            )
                        )}
                    </div>

                    {/* Color Picker */}
                    <div className="flex items-center gap-3">
                        <div className="text-xs text-white/70 w-12">Pick</div>

                        <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                                setMode("pen");
                                setColor(e.target.value);
                            }}
                            className="
            w-10 h-9 p-0 rounded-lg
            border border-white/10 bg-transparent
            cursor-pointer
          "
                        />

                        <div className="text-[11px] font-mono text-white/70">{color}</div>
                    </div>

                    {/* Size */}
                    <div className="flex items-center gap-3">
                        <div className="text-xs text-white/70 w-12">Size</div>

                        <button
                            onClick={decSize}
                            className="
            px-3 py-1 rounded-lg
            bg-black/40 border border-white/10
            hover:bg-black/60 transition active:scale-95
            text-white
          "
                        >
                            -
                        </button>

                        <div className="text-xs w-8 text-center text-white font-semibold">
                            {width}
                        </div>

                        <button
                            onClick={incSize}
                            className="
            px-3 py-1 rounded-lg
            bg-black/40 border border-white/10
            hover:bg-black/60 transition active:scale-95
            text-white
          "
                        >
                            +
                        </button>
                    </div>

                    {/* Mode */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode("pen")}
                            className={`
            flex-1 px-3 py-2 rounded-xl text-sm font-semibold
            border border-white/10 transition active:scale-[0.98]
            ${mode === "pen"
                                    ? "bg-white text-black"
                                    : "bg-black/30 text-white hover:bg-black/50"
                                }
          `}
                        >
                            ✏️ Pen
                        </button>

                        <button
                            onClick={() => setMode("eraser")}
                            className={`
            flex-1 px-3 py-2 rounded-xl text-sm font-semibold
            border border-white/10 transition active:scale-[0.98]
            ${mode === "eraser"
                                    ? "bg-white text-black"
                                    : "bg-black/30 text-white hover:bg-black/50"
                                }
          `}
                        >
                            🧽 Eraser
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2">
                    <button
                        onClick={undoMyStroke}
                        disabled={!joinedRoom}
                        className="
          w-full px-3 py-2 rounded-xl text-sm font-semibold
          border border-white/10 transition active:scale-[0.98]
          bg-blue-500/90 hover:bg-blue-500
          disabled:opacity-40 disabled:cursor-not-allowed
          text-white
        "
                    >
                        Undo (My Last Stroke)
                    </button>

                    <button
                        onClick={redoMyStroke}
                        disabled={!joinedRoom}
                        className="
          w-full px-3 py-2 rounded-xl text-sm font-semibold
          border border-white/10 transition active:scale-[0.98]
          bg-purple-500/90 hover:bg-purple-500
          disabled:opacity-40 disabled:cursor-not-allowed
          text-white
        "
                    >
                        Redo (My Stroke)
                    </button>

                    <button
                        onClick={clearRoomCanvas}
                        disabled={!joinedRoom}
                        className="
          w-full px-3 py-2 rounded-xl text-sm font-semibold
          border border-white/10 transition active:scale-[0.98]
          bg-red-500/90 hover:bg-red-500
          disabled:opacity-40 disabled:cursor-not-allowed
          text-white
        "
                    >
                        Clear Room Canvas
                    </button>
                </div>
            </div>

            {/* Join Overlay */}
            {!joinedRoom && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-center backdrop-blur-md shadow-xl shadow-black/40">
                        <div className="text-lg font-bold text-white">Join a Room to Start</div>
                        <div className="text-sm text-white/70 mt-1">
                            Enter a Room ID & click Join
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}
