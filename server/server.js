import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.send("✅ Collaborative Canvas Server Running (MVP-3)");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ✅ roomId -> [segments]
const roomHistory = new Map();
// Optional safety limit (avoid memory blast)
const MAX_SEGMENTS_PER_ROOM = 50000;

io.on("connection", (socket) => {
    socket.data.roomId = null;

  console.log("✅ Connected:", socket.id);

  socket.on("join_room", ({ roomId }) => {
    socket.data.roomId = roomId;
    console.log("📩 join_room:", roomId, "from", socket.id);

    if (!roomId) return;

    // leave previous rooms
    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }

    socket.join(roomId);

    // ✅ Send history to newly joined client
    const history = roomHistory.get(roomId) || [];
    socket.emit("room_history", { roomId, history });

    socket.emit("room_joined", { roomId });
  });

  socket.on("drawing_step", (data) => {
    const { roomId } = data || {};
    if (!roomId) return;

    // ✅ store in history
    if (!roomHistory.has(roomId)) roomHistory.set(roomId, []);
    const arr = roomHistory.get(roomId);
    arr.push({
      start: data.start,
      end: data.end,
      style: data.style,
    });

    // limit memory
    if (arr.length > MAX_SEGMENTS_PER_ROOM) {
      arr.splice(0, arr.length - MAX_SEGMENTS_PER_ROOM);
    }

    // ✅ broadcast to room except sender
    socket.to(roomId).emit("drawing_step", data);
  });

  socket.on("clear_canvas", ({ roomId }) => {
    if (!roomId) return;

    // ✅ clear server history
    roomHistory.set(roomId, []);

    // ✅ broadcast clear
    io.to(roomId).emit("clear_canvas");
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    if (socket.data.roomId) {
        io.to(socket.data.roomId).emit("cursor_leave", { userId: socket.id });
    }
    });



  socket.on("cursor_move", (data) => {
    const { roomId, x, y } = data || {};
    if (!roomId) return;

    socket.to(roomId).emit("cursor_move", {
        userId: socket.id,
        x,
        y,
    });
    });

});

const PORT = 8000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
