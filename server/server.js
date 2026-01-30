import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.send("✅ Collaborative Canvas Server Running (MVP-6 Redo)");
});

const httpServer = createServer(app);
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://collaborativecanvas-i1fjs2ciw-aviral1511s-projects.vercel.app",
];


const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      // allow Postman / server-to-server calls
      if (!origin) return cb(null, true);

      // allow listed origins
      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error("CORS blocked for origin: " + origin), false);
    },
    methods: ["GET", "POST"],
  },
});

// roomId -> strokes[]
const roomStrokes = new Map();

// roomId -> { userId -> redoStack[] }
const roomRedo = new Map();
const roomUsers = new Map(); // roomId -> Map(userId -> {name, color})
const roomUserColors = new Map();

const PALETTE = [
  "#ffffff", "#22c55e", "#3b82f6", "#eab308",
  "#ef4444", "#a855f7", "#06b6d4", "#f97316"
];

function getColorMap(roomId) {
  if (!roomUserColors.has(roomId)) roomUserColors.set(roomId, new Map());
  return roomUserColors.get(roomId);
}

function pickColor(roomId) {
  const cmap = getColorMap(roomId);
  const used = new Set([...cmap.values()]);

  for (const c of PALETTE) {
    if (!used.has(c)) return c;
  }
  // fallback if all used
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}


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

function getUsersMap(roomId) {
  if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map());
  return roomUsers.get(roomId);
}

function genUserName(roomId) {
  // simple increasing user naming per room
  const umap = getUsersMap(roomId);
  return `User-${umap.size + 1}`;
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

    const cmap = getColorMap(roomId);

    if (!cmap.has(socket.id)) {
      cmap.set(socket.id, pickColor(roomId));
    }

    const myColor = cmap.get(socket.id);

    const umap = getUsersMap(roomId);

    if (!umap.has(socket.id)) {
      umap.set(socket.id, {
        name: genUserName(roomId),
        color: myColor, // ✅ MUST use assigned color
      });
    } else {
      // ✅ if user exists, keep its stored color
      umap.set(socket.id, {
        ...umap.get(socket.id),
        color: myColor,
      });
    }

    const profile = umap.get(socket.id);

    // send to current user
    socket.emit("user_profile", {
      userId: socket.id,
      name: profile.name,
      color: profile.color,
    });

    // broadcast joined info
    socket.to(roomId).emit("user_joined", {
      userId: socket.id,
      name: profile.name,
      color: profile.color,
    });

    // send full users list to everyone (optional but best)
    io.to(roomId).emit("room_users", {
      roomId,
      users: Array.from(umap.entries()).map(([userId, val]) => ({
        userId,
        name: val.name,
        color: val.color,
      })),
    });

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

    socket.on("leave_room", ({ roomId }) => {
      if (!roomId) return;

      socket.leave(roomId);
      console.log(`🚪 ${socket.id} left room: ${roomId}`);

      const umap = getUsersMap(roomId);
      umap.delete(socket.id);

      io.to(roomId).emit("room_users", {
        roomId,
        users: Array.from(umap.entries()).map(([userId, val]) => ({
          userId,
          name: val.name,
          color: val.color,
        })),
      });


      // clear current room from socket
      if (socket.data.roomId === roomId) socket.data.roomId = null;

      // notify others (optional but good)
      io.to(roomId).emit("cursor_leave", { userId: socket.id });
      io.to(roomId).emit("user_left", { userId: socket.id });

      socket.emit("room_left", { roomId });
    });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    if (socket.data.roomId) {
      const rid = socket.data.roomId;

      const umap = getUsersMap(rid);
      umap.delete(socket.id);

      io.to(rid).emit("room_users", {
        roomId: rid,
        users: Array.from(umap.entries()).map(([userId, val]) => ({
          userId,
          name: val.name,
          color: val.color,
        })),
      });
    }


  });
});

const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
