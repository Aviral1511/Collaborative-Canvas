import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { socket } from "../socket.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

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

// function getCanvasCoordinates(e, canvas) {
//     const rect = canvas.getBoundingClientRect();

//     const scaleX = canvas.width / rect.width;
//     const scaleY = canvas.height / rect.height;

//     return {
//         x: (e.clientX - rect.left) * scaleX,
//         y: (e.clientY - rect.top) * scaleY,
//     };
// }

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

    const [roomId, setRoomId] = useState("room-1");
    const [joinedRoom, setJoinedRoom] = useState("");
    const [sockId, setSockId] = useState("");
    const [status, setStatus] = useState("DISCONNECTED");

    const color = "#ffffff";
    const width = 4;

    // const socket = useMemo(() => {
    //     return io(SERVER_URL, {
    //         transports: ["polling"],   // ✅ only polling (no ws)
    //         upgrade: false,            // ✅ don't try websocket upgrade
    //     });
    // }, []);


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
        // ✅ socket connection logs
        socket.on("connect", () => {
            console.log("✅ CONNECTED", socket.id);
            setSockId(socket.id);
            setStatus("CONNECTED");
        });

        socket.on("disconnect", () => {
            console.log("❌ DISCONNECTED");
            setStatus("DISCONNECTED");
            setSockId("");
            setJoinedRoom("");
        });

        socket.on("connect_error", (err) => {
            console.log("❌ CONNECT ERROR:", err.message);
            setStatus("ERROR: " + err.message);
        });

        socket.on("room_joined", ({ roomId }) => {
            console.log("✅ JOINED ROOM:", roomId);
            setJoinedRoom(roomId);
        });

        socket.on("drawing_step", (data) => {
            const ctx = ctxRef.current;
            if (!ctx) return;
            drawLine(ctx, data.start, data.end, data.style);
        });

        socket.on("clear_canvas", () => {
            console.log("🧹 CLEAR CANVAS RECEIVED");
            clearLocalCanvas();
        });

        return () => {
            socket.off("connect");
            // socket.off("disconnect");
            socket.off("connect_error");
            socket.off("room_joined");
            socket.off("drawing_step");
            socket.off("clear_canvas");
            socket.disconnect();
        };
    }, [socket]);

    const joinRoom = () => {
        console.log("🟦 JOIN CLICKED");

        const rid = roomId.trim();
        if (!rid) {
            console.log("⚠️ roomId empty");
            return;
        }

        // if (!socket.connected) {
        //     console.log("⚠️ Socket not connected yet");
        //     return;
        // }

        console.log("📤 Emitting join_room:", rid);
        socket.emit("join_room", { roomId: rid });

        // optional: clear local when switching rooms
        clearLocalCanvas();
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
    };

    const handlePointerMove = (e) => {
        if (!joinedRoom) return;
        if (!isDrawingRef.current) return;

        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        const curr = getCanvasCoordinates(e, canvas);
        const prev = lastPointRef.current;

        if (!prev) {
            lastPointRef.current = curr;
            return;
        }

        const style = { color, width };

        drawLine(ctx, prev, curr, style);

        socket.emit("drawing_step", {
            roomId: joinedRoom,
            start: prev,
            end: curr,
            style,
        });

        lastPointRef.current = curr;
    };

    const handlePointerUp = () => {
        isDrawingRef.current = false;
        lastPointRef.current = null;
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

            <div className="absolute top-4 left-4 w-[340px] bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 p-4 space-y-3">
                <div className="text-sm font-semibold">🎨 MVP-2 Rooms Debug</div>

                <div className="text-xs text-white/70 space-y-1">
                    <div>
                        Socket: <span className="text-white">{status}</span>
                    </div>
                    <div>
                        SocketId: <span className="text-white">{sockId || "-"}</span>
                    </div>
                    <div>
                        Room:{" "}
                        <span className={joinedRoom ? "text-green-300" : "text-yellow-300"}>
                            {joinedRoom || "Not joined"}
                        </span>
                    </div>
                </div>

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

                <button
                    onClick={clearRoomCanvas}
                    disabled={!joinedRoom}
                    className="w-full px-3 py-2 rounded-xl text-sm font-semibold border border-white/10
          bg-red-500/90 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Clear Room Canvas
                </button>

                <div className="text-[11px] text-white/60">
                    Open <b>two tabs</b>, join same roomId, then draw ✅
                </div>
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


