import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.send("✅ Collaborative Canvas Server Running (MVP-6 Redo)");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// roomId -> strokes[]
const roomStrokes = new Map();

// roomId -> { userId -> redoStack[] }
const roomRedo = new Map();

function getStrokes(roomId) {
  if (!roomStrokes.has(roomId)) roomStrokes.set(roomId, []);
  return roomStrokes.get(roomId);
}

function getRedoMap(roomId) {
  if (!roomRedo.has(roomId)) roomRedo.set(roomId, new Map());
  return roomRedo.get(roomId);
}

function getUserRedoStack(roomId, userId) {
  const redoMap = getRedoMap(roomId);
  if (!redoMap.has(userId)) redoMap.set(userId, []);
  return redoMap.get(userId);
}

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  socket.data.roomId = null;

  socket.on("join_room", ({ roomId }) => {
    if (!roomId) return;

    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    console.log(`👥 ${socket.id} joined ${roomId}`);

    socket.emit("room_state", { roomId, strokes: getStrokes(roomId) });
    socket.emit("room_joined", { roomId });
  });

  socket.on("stroke_start", ({ roomId, strokeId, point, style }) => {
    if (!roomId || !strokeId || !point || !style) return;

    const strokes = getStrokes(roomId);

    // ✅ NEW STROKE => CLEAR redo stack for this user (standard UX)
    const redoStack = getUserRedoStack(roomId, socket.id);
    redoStack.length = 0;

    strokes.push({
      id: strokeId,
      userId: socket.id,
      points: [point],
      style,
      ts: Date.now(),
    });

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
    if (s.userId !== socket.id) return;

    s.points.push(point);

    socket.to(roomId).emit("stroke_add", { strokeId, point });
  });

  socket.on("stroke_end", ({ roomId, strokeId }) => {
    if (!roomId || !strokeId) return;
    socket.to(roomId).emit("stroke_end", { strokeId });
  });

  socket.on("undo", ({ roomId }) => {
    if (!roomId) return;

    const strokes = getStrokes(roomId);
    const redoStack = getUserRedoStack(roomId, socket.id);

    // remove last stroke of this user
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].userId === socket.id) {
        const removed = strokes.splice(i, 1)[0];
        redoStack.push(removed);
        break;
      }
    }

    io.to(roomId).emit("room_state", { roomId, strokes });
  });

  socket.on("redo", ({ roomId }) => {
    if (!roomId) return;

    const strokes = getStrokes(roomId);
    const redoStack = getUserRedoStack(roomId, socket.id);

    if (redoStack.length === 0) return;

    const restored = redoStack.pop();
    strokes.push(restored);

    io.to(roomId).emit("room_state", { roomId, strokes });
  });

  socket.on("clear_canvas", ({ roomId }) => {
      if (!roomId) return;

      roomStrokes.set(roomId, []);
      roomRedo.set(roomId, new Map());

      io.to(roomId).emit("clear_canvas");
      io.to(roomId).emit("room_state", { roomId, strokes: [] });
    });

    socket.on("cursor_move", ({ roomId, x, y }) => {
      if (!roomId) return;
      socket.to(roomId).emit("cursor_move", { userId: socket.id, x, y });
    });

    socket.on("stroke_batch", ({ roomId, strokeId, points }) => {
    if (!roomId || !strokeId || !Array.isArray(points) || points.length === 0)
      return;

    const strokes = getStrokes(roomId);
    const s = strokes.find((x) => x.id === strokeId);
    if (!s) return;

    // owner only
    if (s.userId !== socket.id) return;

    // push all points
    for (const p of points) s.points.push(p);

    // broadcast to others
    socket.to(roomId).emit("stroke_batch", { strokeId, points });
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
