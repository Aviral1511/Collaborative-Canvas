import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.send("✅ Collaborative Canvas Server Running (MVP-5 Final)");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// roomId -> strokes[]
const roomStrokes = new Map();

function getStrokes(roomId) {
  if (!roomStrokes.has(roomId)) roomStrokes.set(roomId, []);
  return roomStrokes.get(roomId);
}

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  socket.data.roomId = null;

  socket.on("join_room", ({ roomId }) => {
    if (!roomId) return;

    // leave old rooms
    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    console.log(`👥 ${socket.id} joined ${roomId}`);

    // send full state to this client
    socket.emit("room_state", { roomId, strokes: getStrokes(roomId) });
    socket.emit("room_joined", { roomId });
  });

  // CLIENT sends strokeId (important)
  socket.on("stroke_start", ({ roomId, strokeId, point, style }) => {
    if (!roomId || !strokeId || !point || !style) return;

    const strokes = getStrokes(roomId);

    // add new stroke
    strokes.push({
      id: strokeId,
      userId: socket.id,
      points: [point],
      style,
      ts: Date.now(),
    });

    // broadcast to others in room
    socket.to(roomId).emit("stroke_start", {
      id: strokeId,
      userId: socket.id,
      points: [point],
      style,
    });
  });

  socket.on("stroke_add", ({ roomId, strokeId, point }) => {
    if (!roomId || !strokeId || !point) return;

    const strokes = getStrokes(roomId);
    const s = strokes.find((x) => x.id === strokeId);

    if (!s) return;
    if (s.userId !== socket.id) return; // only owner updates

    s.points.push(point);

    // broadcast only delta
    socket.to(roomId).emit("stroke_add", { strokeId, point });
  });

  socket.on("stroke_end", ({ roomId, strokeId }) => {
    if (!roomId || !strokeId) return;
    socket.to(roomId).emit("stroke_end", { strokeId });
  });

  socket.on("undo", ({ roomId }) => {
    if (!roomId) return;

    const strokes = getStrokes(roomId);

    // remove only last stroke of this user
    let removed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].userId === socket.id) {
        strokes.splice(i, 1);
        removed = true;
        break;
      }
    }

    console.log("↩️ Undo by", socket.id, "removed?", removed);

    // send updated full state
    io.to(roomId).emit("room_state", { roomId, strokes });
  });

  socket.on("clear_canvas", ({ roomId }) => {
    if (!roomId) return;

    roomStrokes.set(roomId, []);
    io.to(roomId).emit("clear_canvas");
    io.to(roomId).emit("room_state", { roomId, strokes: [] });
  });

  socket.on("cursor_move", ({ roomId, x, y }) => {
    if (!roomId) return;
    socket.to(roomId).emit("cursor_move", { userId: socket.id, x, y });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    if (socket.data.roomId) {
      io.to(socket.data.roomId).emit("cursor_leave", { userId: socket.id });
    }
  });
});

const PORT = 8000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
