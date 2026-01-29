import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.get("/", (req, res) => {
  res.send("✅ Collaborative Canvas Server Running");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
  allowEIO3: true,
});


io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  socket.on("join_room", ({ roomId }) => {
    console.log("📩 join_room:", roomId, "from", socket.id);

    if (!roomId) return;

    // leave previous rooms
    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }

    socket.join(roomId);

    console.log("👥 joined =>", roomId, "rooms now:", [...socket.rooms]);

    socket.emit("room_joined", { roomId });
  });

  socket.on("drawing_step", (data) => {
    if (!data?.roomId) return;

    // send to everyone else in the room
    socket.to(data.roomId).emit("drawing_step", data);
  });

  socket.on("clear_canvas", ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit("clear_canvas");
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

const PORT = 8000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
