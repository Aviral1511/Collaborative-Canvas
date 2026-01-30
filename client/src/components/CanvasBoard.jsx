import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:8000";

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

    const [roomId, setRoomId] = useState("room-1");
    const [joinedRoom, setJoinedRoom] = useState("");

    const [cursors, setCursors] = useState({});

    const color = "#ffffff";
    const width = 4;

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

        const style = { color, width };

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

        const style = { color, width };
        drawLine(ctx, prev, curr, style);

        socket.emit("stroke_add", {
            roomId: joinedRoom,
            strokeId: myStrokeIdRef.current,
            point: curr,
        });

        lastPointRef.current = curr;
    };

    const handlePointerUp = () => {
        if (!joinedRoom) return;

        isDrawingRef.current = false;
        lastPointRef.current = null;

        if (myStrokeIdRef.current) {
            socket.emit("stroke_end", {
                roomId: joinedRoom,
                strokeId: myStrokeIdRef.current,
            });
        }

        myStrokeIdRef.current = null;
    };

    return (
        <div className="relative h-full w-full overflow-hidden">
            <canvas
                ref={canvasRef}
                className="h-full w-full touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />

            {/* Ghost Cursors Layer */}
            <div className="absolute inset-0 pointer-events-none">
                {Object.entries(cursors).map(([id, pos]) => (
                    <div
                        key={id}
                        className="absolute"
                        style={{
                            left: pos.x,
                            top: pos.y,
                            transform: "translate(-50%, -50%)",
                        }}
                    >
                        <div className="w-3 h-3 rounded-full bg-green-400 shadow-lg" />
                        <div className="mt-1 text-[10px] text-white/70 bg-black/50 px-2 py-[2px] rounded-md">
                            {id.slice(0, 4)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Panel */}
            <div className="absolute top-4 left-4 w-[340px] bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 p-4 space-y-3">
                <div className="text-sm font-semibold">🎨 MVP-5 Undo</div>

                <div className="flex gap-2">
                    <input
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder="Enter Room ID"
                        className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none text-sm"
                    />
                    <button
                        onClick={joinRoom}
                        className="px-3 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90"
                    >
                        Join
                    </button>
                </div>

                <div className="text-xs text-white/70">
                    Room:{" "}
                    <span className={joinedRoom ? "text-green-300" : "text-yellow-300"}>
                        {joinedRoom || "Not joined"}
                    </span>
                </div>

                <button
                    onClick={undoMyStroke}
                    disabled={!joinedRoom}
                    className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-white/10
          bg-blue-500/90 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Undo (My Last Stroke)
                </button>

                <button
                    onClick={clearRoomCanvas}
                    disabled={!joinedRoom}
                    className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-white/10
          bg-red-500/90 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Clear Room Canvas
                </button>
            </div>

            {!joinedRoom && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-center">
                        <div className="text-lg font-bold">Join a Room to Start</div>
                        <div className="text-sm text-white/70 mt-1">
                            Enter a Room ID & click Join
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
